import { goldenMatchScorer, runSpecEvals } from '@seta/shared-agent-evals';
import { describe, expect, it } from 'vitest';
import {
  avaiCheckerEvalSuite,
  recommenderEvalSuite,
} from '../../../src/backend/orchestration/eval-manifest.ts';

describe('eval: deterministic sub-agents (golden)', () => {
  it('avaiChecker matches golden availability output', async () => {
    const res = await runSpecEvals({
      target: avaiCheckerEvalSuite.buildSpec(),
      data: avaiCheckerEvalSuite.cases,
      scorers: [{ scorer: goldenMatchScorer() }],
    });
    expect(res.verdict).toBe('passed');
    expect(res.scores['golden-match']).toBe(1);
  });

  it('recommender matches golden ranked recommendations', async () => {
    const res = await runSpecEvals({
      target: recommenderEvalSuite.buildSpec(),
      data: recommenderEvalSuite.cases,
      scorers: [{ scorer: goldenMatchScorer() }],
    });
    expect(res.verdict).toBe('passed');
    expect(res.scores['golden-match']).toBe(1);
  });
});
