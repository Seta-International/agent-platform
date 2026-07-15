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
 * the model returns the next canned score (as `{"score": <n>}` text), cycling
 * through `scores`. Never used in the real lane.
 *
 * Both `doGenerate` and `doStream` are implemented, and return the same
 * canned text: any code path that drives the model — including
 * `Agent.stream()`, which every prebuilt `@mastra/evals` scorer
 * (`createAnswerRelevancyScorer`, `createRubricScorer`, etc.) uses internally
 * — gets a deterministic, offline response either way.
 *
 * Scope note (verified by hand against the installed `@mastra/evals@1.5.1`):
 * the prebuilt scorers run a *multi-step* internal workflow (e.g. analyze →
 * generateScore → generateReason), and each step requests a different
 * structured-output JSON schema from the model. Because this fake always
 * returns the same flat `{score}` text regardless of which step is asking,
 * it satisfies the *transport* contract (a real, callable `MastraModelConfig`
 * needing no API key) but will not carry one of those multi-step prebuilt
 * scorers to a successful `run()` result unmodified — the first schema
 * mismatch throws `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`. Consumers
 * building judge scorers on top of this (single-step custom scorers, or a
 * per-step-aware harness) should account for that; it is not a limitation of
 * the import path or mock contract itself.
 */
export function fakeJudgeModel(scores: number[] = [1]): JudgeModel {
  let generateCall = 0;
  let streamCall = 0;
  const nextText = (call: number) => {
    const score = scores[call % scores.length];
    return JSON.stringify({ score });
  };
  return new MockLanguageModelV3({
    doGenerate: async () => {
      const text = nextText(generateCall);
      generateCall += 1;
      return {
        finishReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        content: [{ type: 'text', text }],
        warnings: [],
      } as never;
    },
    doStream: async () => {
      const text = nextText(streamCall);
      streamCall += 1;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: '0' });
            controller.enqueue({ type: 'text-delta', id: '0', delta: text });
            controller.enqueue({ type: 'text-end', id: '0' });
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            });
            controller.close();
          },
        }),
      } as never;
    },
  }) as unknown as JudgeModel;
}
