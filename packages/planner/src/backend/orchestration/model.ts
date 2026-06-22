import type { MastraModelConfig } from '@mastra/core/llm';
import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';

/** Per-turn model override wins; otherwise the runtime's boot-time default. */
export function pickModel(
  ctx: Pick<SpecializedAgentRunCtx, 'model'>,
  fallback: () => MastraModelConfig,
): MastraModelConfig {
  return ctx.model ?? fallback();
}
