import { emitBreakerOpened } from './breaker-events.ts';

export interface BreakerConfig {
  readonly failureThreshold: number;
  readonly openMs: number;
}

const DEFAULT_CONFIG: BreakerConfig = Object.freeze({
  failureThreshold: 3,
  openMs: 60_000,
});

let config: BreakerConfig = DEFAULT_CONFIG;

export type BreakerFailureReason = 'timeout' | 'exception';

interface BreakerState {
  consecutiveFailures: number;
  openUntil: number; // epoch ms; 0 when never opened (or fully closed)
}

export interface BreakerHandle {
  readonly toolId: string;
  readonly tenantId: string;
  /** True iff the breaker is open and the open window has not yet elapsed. */
  isOpen(): boolean;
  /** Epoch ms when the breaker's open window ends; 0 when closed. */
  readonly openUntil: number;
  recordSuccess(): void;
  recordFailure(reason: BreakerFailureReason): void;
}

const states = new Map<string, BreakerState>();

function key(toolId: string, tenantId: string): string {
  return `${tenantId}:${toolId}`;
}

export function setBreakerConfig(c: Partial<BreakerConfig>): void {
  config = {
    failureThreshold: c.failureThreshold ?? config.failureThreshold,
    openMs: c.openMs ?? config.openMs,
  };
}

export function getBreaker(toolId: string, tenantId: string): BreakerHandle {
  const k = key(toolId, tenantId);
  let existing = states.get(k);
  if (!existing) {
    existing = { consecutiveFailures: 0, openUntil: 0 };
    states.set(k, existing);
  }
  const state: BreakerState = existing;

  const handle: BreakerHandle = {
    toolId,
    tenantId,
    get openUntil(): number {
      return state.openUntil;
    },
    isOpen(): boolean {
      // Open if openUntil is in the future. Past openUntil = half-open
      // (one probe allowed); a probe failure re-opens via recordFailure.
      return state.openUntil > Date.now();
    },
    recordSuccess(): void {
      state.consecutiveFailures = 0;
      state.openUntil = 0;
    },
    recordFailure(reason: BreakerFailureReason): void {
      const wasOpen = state.openUntil > Date.now();
      state.consecutiveFailures += 1;

      // While the breaker is open we don't change state on additional
      // failures — but a half-open probe failure DOES re-open.
      if (wasOpen) return;

      if (state.consecutiveFailures >= config.failureThreshold) {
        state.openUntil = Date.now() + config.openMs;
        emitBreakerOpened({
          tool_id: toolId,
          tenant_id: tenantId,
          failure_count: state.consecutiveFailures,
          opened_at: new Date(Date.now()).toISOString(),
          reason,
        });
      }
    },
  };
  return handle;
}

export function __resetBreakersForTests(): void {
  states.clear();
  config = DEFAULT_CONFIG;
}
