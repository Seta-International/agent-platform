import type { MastraModelConfig } from '@mastra/core/llm';
import { MockLanguageModelV3 } from 'ai/test';

/** The model a judge scorer runs its rubric/relevancy prompt on. */
export type JudgeModel = MastraModelConfig;

export interface JudgeConfig {
  /** Injected — the harness never hard-imports a provider. Production wires
   *  resolveModel('auto', { tierHint: 'fast' }).model at temperature 0. */
  model: JudgeModel;
}

/**
 * A deterministic, key-free judge model for harness self-tests. Each call to
 * the model returns the next canned score (as the text the prebuilt scorer
 * parses), cycling through `scores`. Never used in the real lane.
 */
export function fakeJudgeModel(scores: number[] = [1]): JudgeModel {
  let i = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      const score = scores[i % scores.length];
      i += 1;
      return {
        finishReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        content: [{ type: 'text', text: JSON.stringify({ score }) }],
        warnings: [],
      } as never;
    },
  }) as unknown as JudgeModel;
}
