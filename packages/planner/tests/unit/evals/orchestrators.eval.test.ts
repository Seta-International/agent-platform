import {
  runSpecEvals,
  schemaConformanceScorer,
  trustEnvelopeScorer,
} from '@seta/shared-agent-evals';
import { describe, expect, it } from 'vitest';
import {
  qnaOrchestratorEvalSuite,
  weeklyPlanOrchestratorEvalSuite,
} from '../../../src/backend/orchestration/eval-manifest.ts';

describe('eval: planner.qna.orchestrator (deterministic gate)', () => {
  it('every case yields schema-valid output with a valid trust envelope', async () => {
    const spec = qnaOrchestratorEvalSuite.buildSpec();
    const res = await runSpecEvals({
      target: spec,
      data: qnaOrchestratorEvalSuite.cases,
      scorers: [
        { scorer: schemaConformanceScorer(spec.outputSchema) },
        { scorer: trustEnvelopeScorer() },
      ],
    });
    expect(res.verdict).toBe('passed');
    expect(res.summary.totalCases).toBeGreaterThan(0);
  });
});

describe('eval: planner.weeklyPlan.orchestrator (deterministic gate)', () => {
  it('every case yields schema-valid output with a valid trust envelope', async () => {
    const spec = weeklyPlanOrchestratorEvalSuite.buildSpec();
    const res = await runSpecEvals({
      target: spec,
      data: weeklyPlanOrchestratorEvalSuite.cases,
      scorers: [
        { scorer: schemaConformanceScorer(spec.outputSchema) },
        { scorer: trustEnvelopeScorer() },
      ],
    });
    expect(res.verdict).toBe('passed');
    expect(res.summary.totalCases).toBeGreaterThan(0);
  });
});
