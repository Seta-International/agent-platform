import { emit } from './emit.ts';
import { withEmit } from './with-emit.ts';

/** Event name lives here so producers never import @seta/billing. */
export const BILLING_USAGE_OBSERVED = 'billing.usage.observed' as const;
export const BILLING_USAGE_OBSERVED_VERSION = 1 as const;

/** Where the spend came from — drives the dashboard breakdown. */
export type UsageFeature = 'chat' | 'workflow' | 'subagent' | 'embedding';

export interface EmitUsageArgs {
  tenantId: string;
  feature: UsageFeature;
  provider: string;
  modelKey: string;
  tokensIn: number;
  tokensOut: number;
  causedByUserId: string | null;
}

/**
 * Fire-and-forget usage telemetry. Writes one `billing.usage.observed` row to
 * the outbox in its own one-shot transaction (not tied to a domain mutation),
 * mirroring breaker-emitter. The billing recorder is the sole consumer.
 * Never throws into the caller's hot path — usage capture must not break chat.
 */
export async function emitUsageObserved(args: EmitUsageArgs): Promise<void> {
  if (args.tokensIn <= 0 && args.tokensOut <= 0) return; // nothing to record
  try {
    await withEmit(
      { actor: { userId: args.causedByUserId ?? 'system', tenantId: args.tenantId } },
      async () => {
        await emit({
          tenantId: args.tenantId,
          aggregateType: 'billing.usage',
          aggregateId: args.causedByUserId ?? args.tenantId,
          eventType: BILLING_USAGE_OBSERVED,
          eventVersion: BILLING_USAGE_OBSERVED_VERSION,
          causedByUserId: args.causedByUserId ?? undefined,
          payload: {
            feature: args.feature,
            provider: args.provider,
            model_key: args.modelKey,
            tokens_in: Math.max(0, Math.round(args.tokensIn)),
            tokens_out: Math.max(0, Math.round(args.tokensOut)),
            caused_by_user_id: args.causedByUserId,
          },
        });
      },
    );
  } catch (err) {
    console.error('[billing.usage.emit] outbox write failed', err);
  }
}
