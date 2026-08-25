// packages/planner/tests/fixtures/golden/action/breaker-env.ts
//
// The A2 lane's breaker environment (design D-1/D-2).
//
// `BreakerConfig` has no disable flag, and adding one would change production code
// for a test's benefit. So the lane raises `failureThreshold` past reach: the
// `consecutiveFailures >= config.failureThreshold` check in
// `sdks/agent/src/circuit-breaker.ts:78` becomes unreachable, `openUntil` is never
// set, and `isOpen()` is always false.
//
// This lives in a module rather than inline in the lane because the lane needs a
// live model and an hour to run, and this behaviour has to be provable in
// milliseconds. `packages/planner/tests/unit/golden/action/breaker-env.test.ts` is
// that proof.
import { __resetBreakersForTests, setBreakerConfig } from '@seta/agent-sdk';

/** Call in the lane's `beforeAll`. */
export function disableBreakerForLane(): void {
  setBreakerConfig({ failureThreshold: Number.MAX_SAFE_INTEGER });
}

/**
 * Call in the lane's `afterAll`. Not optional: `setBreakerConfig` writes
 * process-global state, so without this the lane leaks its config into every other
 * test file sharing the process — the exact class of bug this module fixes.
 * `__resetBreakersForTests` both clears accumulated state and restores
 * `DEFAULT_CONFIG` (`circuit-breaker.ts:95-98`).
 */
export function restoreBreakerAfterLane(): void {
  __resetBreakersForTests();
}
