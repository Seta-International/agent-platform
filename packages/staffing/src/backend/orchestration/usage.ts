import type { MastraModelConfig } from '@mastra/core/llm';
import { emitUsageObserved, type UsageFeature } from '@seta/core/events';

/** Shape we read off Mastra's FullOutput — only the fields we need. */
interface GenerateUsage {
  usage?: { inputTokens?: number; outputTokens?: number };
  response?: { modelId?: string };
}

/**
 * Derive a "provider/model" key from the Mastra model config the agent was
 * built with. This is the billing pricing-table key, so it must be the
 * fully-qualified form (the provider-echoed `response.modelId` is often a bare
 * model id). Falls back to 'unknown' for opaque configs (e.g. test mocks).
 */
export function modelKeyOf(model: MastraModelConfig): string {
  if (typeof model === 'string') return model;
  if (model && typeof model === 'object') {
    const m = model as { providerId?: unknown; modelId?: unknown };
    if (typeof m.providerId === 'string' && typeof m.modelId === 'string') {
      return `${m.providerId}/${m.modelId}`;
    }
  }
  return 'unknown';
}

/**
 * Emit a usage event for one agent.generate() result. Best-effort: never throws
 * (emitUsageObserved swallows its own errors). The model key prefers the
 * provider echo only when it is fully qualified ("provider/model"); otherwise
 * the configured fallback (which matches the billing pricing table).
 */
export async function recordGenerateUsage(
  r: GenerateUsage,
  args: {
    tenantId: string;
    causedByUserId: string | null;
    feature: UsageFeature;
    fallbackModelKey: string;
  },
): Promise<void> {
  const echoed = r.response?.modelId;
  const modelKey = echoed?.includes('/') ? echoed : args.fallbackModelKey;
  const provider = modelKey.includes('/') ? (modelKey.split('/')[0] as string) : 'unknown';
  await emitUsageObserved({
    tenantId: args.tenantId,
    feature: args.feature,
    provider,
    modelKey,
    tokensIn: r.usage?.inputTokens ?? 0,
    tokensOut: r.usage?.outputTokens ?? 0,
    causedByUserId: args.causedByUserId,
  });
}
