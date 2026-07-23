import {
  runSpecEvals,
  schemaConformanceScorer,
  trustEnvelopeScorer,
} from '@seta/shared-agent-evals';
import { describe, expect, it } from 'vitest';
import { taskSearchEvalSuite } from '../../../src/backend/orchestration/eval-manifest.ts';

describe('eval: planner.query.taskSearch (deterministic gate)', () => {
  it('every case yields schema-valid output with a valid trust envelope', async () => {
    const spec = taskSearchEvalSuite.buildSpec();
    const res = await runSpecEvals({
      target: spec,
      data: taskSearchEvalSuite.cases,
      scorers: [
        { scorer: schemaConformanceScorer(spec.outputSchema) },
        { scorer: trustEnvelopeScorer() },
      ],
    });
    expect(res.verdict).toBe('passed');
    expect(res.summary.totalCases).toBeGreaterThan(0);
  });
});
