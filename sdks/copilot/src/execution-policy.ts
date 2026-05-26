export interface ExecutionPolicy {
  readonly readMs: number;
  readonly writeMs: number;
  readonly maxMs: number;
}

const DEFAULT_POLICY: ExecutionPolicy = Object.freeze({
  readMs: 30_000,
  writeMs: 60_000,
  maxMs: 300_000,
});

let current: ExecutionPolicy = DEFAULT_POLICY;

/**
 * Override the SDK's tool-execution timeout defaults. Called once at engine
 * boot by `packages/copilot/src/register.ts` after reading env vars; never by
 * tool authors. Partial — any field omitted keeps its previous value.
 */
export function setExecutionPolicy(p: Partial<ExecutionPolicy>): void {
  current = {
    readMs: p.readMs ?? current.readMs,
    writeMs: p.writeMs ?? current.writeMs,
    maxMs: p.maxMs ?? current.maxMs,
  };
}

/**
 * Decide the timeout for one tool call.
 *
 *   spec.executionTimeoutMs   — per-tool override (capped by max)
 *   spec.needsApproval        — write tool (60s default) vs read tool (30s)
 *
 * Function-form needsApproval is treated as a write because the predicate
 * exists precisely to gate mutations conditionally.
 */
export function resolveTimeoutMs(spec: {
  needsApproval?: boolean | ((...args: never[]) => unknown);
  executionTimeoutMs?: number;
}): number {
  const isWrite = spec.needsApproval === true || typeof spec.needsApproval === 'function';
  const base = isWrite ? current.writeMs : current.readMs;
  const candidate = spec.executionTimeoutMs ?? base;
  return Math.min(candidate, current.maxMs);
}

export function __resetExecutionPolicyForTests(): void {
  current = DEFAULT_POLICY;
}
