import type { MastraModelConfig } from '@mastra/core/llm';
import { answerRelevancyScorer, fakeJudgeModel, runQualityEvals } from '@seta/shared-agent-evals';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { queryGeneralAnswerQualitySuite } from '../../../src/backend/orchestration/eval-manifest.ts';

// A mock generation model returning canned prose — proves the real-model path
// (no runAgent seam) without an API key. Verified empirically (see
// task-9-report.md): general-answer.ts calls `agent.generate()` directly,
// which Mastra's engine drives via `AISDKV6LanguageModel.doGenerate()` only
// (confirmed by making `doGenerate` throw and observing the failure surface
// through that exact call path) — unlike the judge model in
// packages/shared-agent-evals/src/judge.ts, which also needs `doStream`
// because the prebuilt `@mastra/evals` judge scorers run via `agent.stream()`
// internally. `doStream` is deliberately omitted here.
const genModel = new MockLanguageModelV3({
  doGenerate: async () =>
    ({
      finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      content: [{ type: 'text', text: 'You have 3 open tasks due this week.' }],
      warnings: [],
    }) as never,
}) as unknown as MastraModelConfig;

describe('quality: planner.query.generalAnswer', () => {
  it('runs the real generation path and scores the answer', async () => {
    const res = await runQualityEvals({
      suite: queryGeneralAnswerQualitySuite,
      genModel,
      scorers: [{ scorer: answerRelevancyScorer({ model: fakeJudgeModel([1]) }) }],
    });
    expect(res.specId).toBe('planner.query.generalAnswer');
    expect(res.totalCases).toBeGreaterThan(0);
    expect(res.scores['answer-relevancy']).toBeGreaterThanOrEqual(0);
  });
});
