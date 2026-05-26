/**
 * Payload published when a tool's circuit breaker transitions from
 * closed/half-open → open. Field shapes match the Zod schema registered in
 * `packages/copilot/src/events/types.ts` under the event name
 * `copilot.tool.breaker_opened`.
 */
export interface BreakerOpenedEvent {
  tool_id: string;
  tenant_id: string;
  failure_count: number;
  opened_at: string; // ISO 8601 timestamp
  reason: 'timeout' | 'exception';
}

export type BreakerEventEmitter = (event: BreakerOpenedEvent) => void | Promise<void>;

let emitter: BreakerEventEmitter | undefined;

/**
 * Install the function that publishes breaker-open events to the outbox. Must
 * be called once at engine boot. The SDK does not import @seta/core; this DI
 * seam keeps the infra-tier rule intact.
 */
export function setBreakerEventEmitter(fn: BreakerEventEmitter): void {
  emitter = fn;
}

/**
 * Fire-and-forget publish. Safe to call before any emitter is registered
 * (no-op). Synchronous throws and rejected promises are logged to
 * console.error and swallowed — emission must never interrupt tool execution.
 */
export function emitBreakerOpened(event: BreakerOpenedEvent): void {
  if (!emitter) return;
  try {
    const result = emitter(event);
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch((err) => {
        console.error('[copilot.tool.breaker_opened] emitter rejected', err);
      });
    }
  } catch (err) {
    console.error('[copilot.tool.breaker_opened] emitter threw', err);
  }
}

export function __resetBreakerEmitterForTests(): void {
  emitter = undefined;
}
