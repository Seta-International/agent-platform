// packages/planner/tests/fixtures/golden/eval-models.ts
//
// Single source of truth for which models the golden eval uses, so no lane
// hardcodes a model string. Two distinct roles:
//   * gen model  — the agent under test. Resolved from the SAME env the
//     production model registry reads (EVAL_GEN_MODEL / AGENT_MODEL_DEFAULT +
//     <PROVIDER>_BASE_URL / <PROVIDER>_API_KEY), so each environment
//     (dev/uat/prod) evaluates its own configured (self-hosted) model with zero
//     code change. It intentionally does NOT import `@seta/agent`'s
//     `resolveModel`: `@seta/agent` already depends on `@seta/planner`, so a
//     planner→agent import closes a workspace cycle that fails `turbo run
//     typecheck`. Instead we replicate the tiny provider-config rule below (the
//     only branch the eval needs), keeping the packages acyclic.
//   * judge model — an OpenAI model for LLM-as-judge (advisory B* metrics),
//     driven by EVAL_JUDGE_MODEL (default openai/gpt-5-mini). Kept separate from the
//     agent catalog on purpose: the judge must be a capable cloud model even when
//     the agent is a self-hosted one.
import type { MastraModelConfig } from '@mastra/core/llm';

export const DEFAULT_JUDGE_MODEL = 'openai/gpt-5-mini';

/**
 * The agent-under-test model. `EVAL_GEN_MODEL` (or `AGENT_MODEL_DEFAULT`) is a
 * concrete `"provider/model"` id. Mirrors `@seta/agent`'s `parseModelEntry`:
 *   • self-hosted / openai-compatible (a `<PROVIDER>_BASE_URL` is set) → an
 *     explicit config object carrying that base URL + optional API key;
 *   • cloud provider (no base URL) → the bare `"provider/model"` string, which
 *     Mastra resolves via the provider's API key.
 * Throws on an unusable value (unset, `auto`, or missing the provider slash) —
 * the eval must not silently run against the wrong model.
 */
/**
 * Whether this environment is configured to run the golden lane at all. Every lane
 * calls a real model — for embeddings as well as generation — so with no concrete
 * `"provider/model"` id there is nothing to evaluate against and the lanes skip
 * rather than fail. The PR gate (`ci.yml`) carries no model config on purpose:
 * paid, network-dependent calls do not belong in it. `eval-quality.yml` runs the
 * lane nightly with one configured. Reads the same env as `resolveEvalGenModel`,
 * which still throws — once a lane runs, an unusable model must not pass silently.
 */
export function hasEvalModelEnv(): boolean {
  const key = process.env.EVAL_GEN_MODEL ?? process.env.AGENT_MODEL_DEFAULT;
  return key !== undefined && key !== '' && key !== 'auto' && key.includes('/');
}

export function resolveEvalGenModel(): { key: string; model: MastraModelConfig } {
  const key = process.env.EVAL_GEN_MODEL ?? process.env.AGENT_MODEL_DEFAULT;
  if (!key || key === 'auto' || !key.includes('/')) {
    throw new Error(
      'golden eval: set EVAL_GEN_MODEL to a concrete "provider/model" id ' +
        '(AGENT_MODEL_DEFAULT="auto" cannot be resolved without the agent catalog)',
    );
  }
  const slash = key.indexOf('/');
  const providerId = key.slice(0, slash);
  const modelId = key.slice(slash + 1);
  const upper = providerId.toUpperCase().replace(/-/g, '_');
  const url = process.env[`${upper}_BASE_URL`];
  const model: MastraModelConfig = url
    ? ({
        providerId,
        modelId,
        url,
        apiKey: process.env[`${upper}_API_KEY`] ?? '',
      } as unknown as MastraModelConfig)
    : (key as unknown as MastraModelConfig);
  return { key, model };
}

/** The LLM-as-judge model: EVAL_JUDGE_MODEL or the OpenAI default. */
export function resolveEvalJudgeModel(): { key: string; model: MastraModelConfig } {
  const key = process.env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
  // A bare "provider/model" string is a valid MastraModelConfig (Mastra resolves
  // it via the provider's API key), matching how the lanes passed models before.
  return { key, model: key as unknown as MastraModelConfig };
}
