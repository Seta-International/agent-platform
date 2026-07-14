import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { plannerEvalManifest } from '@seta/planner/evals';
import type { EvalManifest } from '@seta/shared-agent-evals';
import { beforeAll, describe, expect, it } from 'vitest';
import { composeRegistries } from '../../src/compose-registries.ts';
import { testComposeDeps } from '../helpers/compose.ts';

// Every module that owns specialists appends its manifest here.
const MANIFESTS: EvalManifest[] = [plannerEvalManifest];

// Specialists intentionally without deterministic eval coverage yet.
// Each entry MUST have a reason; Phase 2 (judge scorers) removes them.
const KNOWN_UNCOVERED = new Map<string, string>([
  // e.g. ['planner.assignment-orchestrator', 'LLM-backed; judge coverage in Phase 2'],
]);

// Known blind spot: this gate only sees specialists that composeRegistries()
// builds. Specialists registered only through a live-adapter build path —
// i.e. constructed with real DB adapters, not the fake ports composeRegistries
// wires here via testComposeDeps() — never enter the snapshot below, so they
// can't show up as "uncovered" even without eval coverage.
//
// Concretely: `planner.assignment-orchestrator` is registered via
// `buildAssignmentOrchestrationRuntime` (packages/planner/src/backend/orchestration/assignment/register.ts),
// which requires live DB adapters wired in apps/server/src/index.ts. It is
// intentionally excluded from composeRegistries and therefore invisible to
// this test. Bringing DB-bound runtimes into the gate's view (e.g. via fake
// ports for that build path too) is deferred to Phase 2.
beforeAll(() => {
  SpecializedAgentRegistry.__resetForTests();
  composeRegistries(testComposeDeps());
});

describe('eval coverage', () => {
  it('every registered specialist has an eval suite or an allowlisted exemption', () => {
    // Guard against a vacuous pass: if composeRegistries() ever regressed to
    // registering zero specialists, the uncovered-check below would trivially
    // pass with nothing to check. Mirrors agent-registry-integrity.test.ts.
    expect(SpecializedAgentRegistry.snapshot().length).toBeGreaterThan(0);

    const covered = new Set(MANIFESTS.flatMap((m) => m.suites.map((s) => s.specId)));
    const uncovered = SpecializedAgentRegistry.snapshot()
      .map((s) => s.id)
      .filter((id) => !covered.has(id) && !KNOWN_UNCOVERED.has(id));
    expect(uncovered, `specialists missing eval coverage: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('allowlist has no stale entries (all still registered)', () => {
    const ids = new Set(SpecializedAgentRegistry.snapshot().map((s) => s.id));
    for (const id of KNOWN_UNCOVERED.keys()) expect(ids.has(id)).toBe(true);
  });
});
