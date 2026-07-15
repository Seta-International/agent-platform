import type { MastraScorer } from '@mastra/core/evals';
import {
  createAnswerRelevancyScorer,
  createFaithfulnessScorer,
  createHallucinationScorer,
  createToxicityScorer,
} from '@mastra/evals/scorers/prebuilt';
import type { AgentResult } from '@seta/agent-sdk';
import type { JudgeModel } from './judge.ts';

type ResultOutput = AgentResult<unknown>;

interface JudgeScorerCfg {
  model: JudgeModel;
  /** Extracts the answer text the judge scores from AgentResult.result. */
  answerOf?: (result: unknown) => string;
}

const defaultAnswerOf = (r: unknown): string =>
  r && typeof r === 'object' && 'answer' in r
    ? String((r as { answer: unknown }).answer)
    : JSON.stringify(r);

/**
 * Wrap a prebuilt Mastra judge scorer so our runner's
 * `run({ input, output: AgentResult, groundTruth })` shape maps to the
 * `{ input, output: answerText }` shape the prebuilt scorer expects.
 *
 * `MastraScorer` (from `@mastra/core/evals`) is a real class with private
 * (`#`-prefixed) instance fields backing `run()`/the `id` getter. Spreading a
 * class instance (`{ ...prebuilt }`) only copies *own enumerable*
 * properties — the getters and `run` live on the prototype and the private
 * state isn't copyable at all — so a spread-based wrapper silently loses the
 * prototype and throws/breaks when its methods run. Verified empirically:
 * a spread-based `adapt()` produced an object whose `run` no longer worked
 * against the private-field-backed prototype. Returning a plain object
 * literal that exposes only the stable contract our runner needs (`id` and
 * an async `run` that delegates to `prebuilt.run(...)`) avoids the private
 * fields entirely and is what's implemented here. The object is not an
 * actual `MastraScorer` instance, so it's cast via `as unknown as
 * MastraScorer` at the boundary — everything outside this file only ever
 * calls `.id` and `.run(...)`, both of which behave identically to a real
 * instance. Keeping the prebuilt factory behind this adapter is the
 * isolation layer (spec §15).
 */
function adapt(
  id: string,
  prebuilt: MastraScorer,
  answerOf: (result: unknown) => string,
): MastraScorer {
  return {
    id,
    run: async (runInput: { input?: unknown; output: unknown; groundTruth?: unknown }) => {
      const answer = answerOf((runInput.output as ResultOutput).result);
      return prebuilt.run({
        input: runInput.input as never,
        output: answer as never,
        groundTruth: runInput.groundTruth as never,
      });
    },
  } as unknown as MastraScorer;
}

export function answerRelevancyScorer(cfg: JudgeScorerCfg): MastraScorer {
  return adapt(
    'answer-relevancy',
    createAnswerRelevancyScorer({ model: cfg.model as never }) as MastraScorer,
    cfg.answerOf ?? defaultAnswerOf,
  );
}

export function faithfulnessScorer(cfg: JudgeScorerCfg): MastraScorer {
  return adapt(
    'faithfulness',
    createFaithfulnessScorer({ model: cfg.model as never }) as MastraScorer,
    cfg.answerOf ?? defaultAnswerOf,
  );
}

export function hallucinationScorer(cfg: JudgeScorerCfg): MastraScorer {
  return adapt(
    'hallucination',
    createHallucinationScorer({ model: cfg.model as never }) as MastraScorer,
    cfg.answerOf ?? defaultAnswerOf,
  );
}

export function toxicityScorer(cfg: JudgeScorerCfg): MastraScorer {
  return adapt(
    'toxicity',
    createToxicityScorer({ model: cfg.model as never }) as MastraScorer,
    cfg.answerOf ?? defaultAnswerOf,
  );
}
