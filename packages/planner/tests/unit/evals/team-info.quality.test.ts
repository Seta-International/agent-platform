import type { MastraModelConfig } from '@mastra/core/llm';
import { answerRelevancyScorer, fakeJudgeModel, runQualityEvals } from '@seta/shared-agent-evals';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { teamInfoQualitySuite } from '../../../src/backend/orchestration/eval-manifest.ts';

// Canned generation model (no tool-call parts → the tool loop's mocks stay
// inert here; the real tool loop over mocked evidence runs only in the nightly
// with a real model). Mirrors task-detail.quality.test.ts.
const genModel = new MockLanguageModelV3({
  doGenerate: async () =>
    ({
      finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      content: [{ type: 'text', text: 'The Platform group has 5 members across 2 plans.' }],
      warnings: [],
    }) as never,
}) as unknown as MastraModelConfig;

describe('quality: planner.qna.teamInfo', () => {
  it('builds the real tool-loop spec and scores the answer', async () => {
    const res = await runQualityEvals({
      suite: teamInfoQualitySuite,
      genModel,
      scorers: [{ scorer: answerRelevancyScorer({ model: fakeJudgeModel([1]) }) }],
    });
    expect(res.specId).toBe('planner.qna.teamInfo');
    expect(res.totalCases).toBeGreaterThan(0);
    expect(res.scores['answer-relevancy']).toBeGreaterThanOrEqual(0);
  });
});
