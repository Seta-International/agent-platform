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
  ['planner.action', 'FUT-813 registers the A2 agent; its mutation corpus lands with FUT-807'],
]);

// This gate only sees specialists that composeRegistries() builds. DB-bound
// specialists — e.g. `planner.assignment-orchestrator`, built by
// `buildAssignmentOrchestrationRuntime`
// (packages/planner/src/backend/orchestration/assignment/register.ts) —
// used to be registered only via a live-DB-adapter path in
// apps/server/src/index.ts that ran before composeRegistries(), so this gate
// never snapshotted them (a documented blind spot). composeRegistries() now
// takes the assignment orchestrator's ports/repo/store as ComposeDeps: real
// adapters from index.ts, fake (throwing) ports from testComposeDeps() here.
// So `planner.assignment-orchestrator` IS snapshotted below and must carry
// eval coverage — it does, via `assignmentOrchestratorEvalSuite` in
// plannerEvalManifest.
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
