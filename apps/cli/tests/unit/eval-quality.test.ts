import { describe, expect, it } from 'vitest';
import { summarizeQualityResults } from '../../src/commands/eval-quality.ts';

describe('summarizeQualityResults', () => {
  it('flattens per-spec scores into printable rows', () => {
    const rows = summarizeQualityResults([
      {
        specId: 'planner.qna.generalAnswer',
        scores: { 'answer-relevancy': 0.9 },
        cases: [],
        totalCases: 2,
      },
    ]);
    expect(rows).toEqual([
      { specId: 'planner.qna.generalAnswer', scorerId: 'answer-relevancy', mean: 0.9 },
    ]);
  });
});
