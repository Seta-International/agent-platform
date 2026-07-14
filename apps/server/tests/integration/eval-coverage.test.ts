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

beforeAll(() => {
  SpecializedAgentRegistry.__resetForTests();
  composeRegistries(testComposeDeps());
});

describe('eval coverage', () => {
  it('every registered specialist has an eval suite or an allowlisted exemption', () => {
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
