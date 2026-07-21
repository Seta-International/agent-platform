import { fakeJudgeModel } from '@seta/shared-agent-evals';
import { describe, expect, it } from 'vitest';
import { buildQualityScorers, summarizeQualityResults } from '../../src/commands/eval-quality.ts';

describe('buildQualityScorers', () => {
  it('registers the hallucination scorer alongside relevancy/faithfulness/toxicity', () => {
    const ids = buildQualityScorers(fakeJudgeModel()).map((s) => s.scorer.id);
    expect(ids).toContain('hallucination');
    expect(ids).toEqual(['answer-relevancy', 'faithfulness', 'hallucination', 'toxicity']);
  });
});

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

  it('flattens multiple specs with multiple scorer keys each, preserving order and values', () => {
    const rows = summarizeQualityResults([
      {
        specId: 'planner.qna.generalAnswer',
        scores: { 'answer-relevancy': 0.9, faithfulness: 0.75 },
        cases: [],
        totalCases: 2,
      },
      {
        specId: 'planner.qna.followUp',
        scores: { 'answer-relevancy': 0.6, faithfulness: 0.8, toxicity: 1 },
        cases: [],
        totalCases: 3,
      },
    ]);
    expect(rows).toEqual([
      { specId: 'planner.qna.generalAnswer', scorerId: 'answer-relevancy', mean: 0.9 },
      { specId: 'planner.qna.generalAnswer', scorerId: 'faithfulness', mean: 0.75 },
      { specId: 'planner.qna.followUp', scorerId: 'answer-relevancy', mean: 0.6 },
      { specId: 'planner.qna.followUp', scorerId: 'faithfulness', mean: 0.8 },
      { specId: 'planner.qna.followUp', scorerId: 'toxicity', mean: 1 },
    ]);
  });
});
