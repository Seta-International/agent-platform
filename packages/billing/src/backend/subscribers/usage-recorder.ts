import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { sql } from 'drizzle-orm';
import {
  BILLING_USAGE_OBSERVED,
  BILLING_USAGE_OBSERVED_VERSION,
  type BillingUsageObservedPayload,
} from '../../events.ts';
import { periodKeys } from '../../period.ts';
import { priceFor } from '../../pricing.ts';
import { budgetCounters } from '../db/schema/budget-counters.ts';
import { usageLedger } from '../db/schema/usage-ledger.ts';

function fixed10(n: number): string {
  return n.toFixed(10);
}

async function handle(
  event: DomainEvent<BillingUsageObservedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const p = event.payload;
  const price = priceFor(p.model_key);
  const cost = p.tokens_in * price.in + p.tokens_out * price.out;
  const { day, month } = periodKeys(event.occurredAt);

  // 1) Append-only ledger insert, idempotent on source_event_id.
  const inserted = await ctx.tx
    .insert(usageLedger)
    .values({
      tenantId: event.tenantId,
      occurredAt: event.occurredAt,
      sourceEventId: event.id,
      feature: p.feature,
      provider: p.provider,
      modelKey: p.model_key,
      tokensIn: p.tokens_in,
      tokensOut: p.tokens_out,
      unitPriceIn: fixed10(price.in),
      unitPriceOut: fixed10(price.out),
      cost: fixed10(cost),
      causedByUserId: p.caused_by_user_id,
      periodDay: day,
      periodMonth: month,
    })
    .onConflictDoNothing({ target: usageLedger.sourceEventId })
    .returning({ id: usageLedger.id });

  // Redelivery of an already-recorded event → stop (no double counter increment).
  if (inserted.length === 0) return;

  // 2) Upsert per-period spend counters in the same transaction.
  for (const [periodType, periodKey] of [
    ['day', day],
    ['month', month],
  ] as const) {
    await ctx.tx
      .insert(budgetCounters)
      .values({ tenantId: event.tenantId, periodType, periodKey, spend: fixed10(cost) })
      .onConflictDoUpdate({
        target: [budgetCounters.tenantId, budgetCounters.periodType, budgetCounters.periodKey],
        set: { spend: sql`${budgetCounters.spend} + ${fixed10(cost)}::numeric` },
      });
  }
}

export function usageRecorderSubscriber(): SubscriberDef<BillingUsageObservedPayload> {
  return {
    subscription: 'billing.usage.recorder',
    event: BILLING_USAGE_OBSERVED,
    eventVersion: BILLING_USAGE_OBSERVED_VERSION,
    handler: handle,
  };
}
