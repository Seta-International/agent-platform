// packages/planner/tests/fixtures/golden/eval-models.ts
//
// Single source of truth for which models the golden eval uses, so no lane
// hardcodes a model string. Two distinct roles:
//   * gen model  — the agent under test. Resolved via the production model
//     registry (@seta/agent `resolveModel`), which reads AGENT_MODELS /
//     AGENT_MODEL_DEFAULT / <PROVIDER>_BASE_URL — the same env/GitHub variables
//     production uses, so each environment (dev/uat/prod) evaluates its own
//     configured (self-hosted) model with zero code change.
//   * judge model — an OpenAI model for LLM-as-judge (advisory B* metrics),
//     driven by EVAL_JUDGE_MODEL (default openai/gpt-5-mini). Kept separate from the
//     agent catalog on purpose: the judge must be a capable cloud model even when
//     the agent is a self-hosted one.
import type { MastraModelConfig } from '@mastra/core/llm';
import { resolveModel } from '@seta/agent';

export const DEFAULT_JUDGE_MODEL = 'openai/gpt-5-mini';

/** The agent-under-test model: the environment's configured default. */
export function resolveEvalGenModel(): { key: string; model: MastraModelConfig } {
  const { entry, model } = resolveModel(undefined);
  return { key: entry.key, model };
}

/** The LLM-as-judge model: EVAL_JUDGE_MODEL or the OpenAI default. */
export function resolveEvalJudgeModel(): { key: string; model: MastraModelConfig } {
  const key = process.env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
  // A bare "provider/model" string is a valid MastraModelConfig (Mastra resolves
  // it via the provider's API key), matching how the lanes passed models before.
  return { key, model: key as unknown as MastraModelConfig };
}
