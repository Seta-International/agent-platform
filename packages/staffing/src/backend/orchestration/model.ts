import type { MastraModelConfig } from '@mastra/core/llm';
import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';

/** Per-turn model pick: the chat route's override (ctx.model, from the user's
 *  model selector) wins; otherwise the runtime's boot-time default. Every lazy
 *  resolveModel() call site in the orchestration goes through this. */
export function pickModel(
  ctx: Pick<SpecializedAgentRunCtx, 'model'>,
  fallback: () => MastraModelConfig,
): MastraModelConfig {
  return ctx.model ?? fallback();
}
