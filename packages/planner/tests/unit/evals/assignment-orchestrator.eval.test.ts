import { runSpecEvals, schemaConformanceScorer } from '@seta/shared-agent-evals';
import { describe, expect, it } from 'vitest';
import { assignmentOrchestratorEvalSuite } from '../../../src/backend/orchestration/eval-manifest.ts';

describe('eval: planner.assignment-orchestrator (deterministic seam)', () => {
  it('answers a turn via the runAgent seam', async () => {
    const spec = assignmentOrchestratorEvalSuite.buildSpec();
    const res = await runSpecEvals({
      target: spec,
      data: assignmentOrchestratorEvalSuite.cases,
      scorers: [{ scorer: schemaConformanceScorer(spec.outputSchema) }],
    });
    expect(res.verdict).toBe('passed');
    expect(res.summary.totalCases).toBeGreaterThan(0);
  });
});
