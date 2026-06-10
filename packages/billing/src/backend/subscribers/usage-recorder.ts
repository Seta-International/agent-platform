import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { and, eq, sql } from 'drizzle-orm';
import {
  BILLING_USAGE_OBSERVED,
  BILLING_USAGE_OBSERVED_VERSION,
  type BillingUsageObservedPayload,
} from '../../events.ts';
import { periodKeys } from '../../period.ts';
import { budgetAlerts } from '../db/schema/budget-alerts.ts';
import { budgetCounters } from '../db/schema/budget-counters.ts';
import { tenantBudgets } from '../db/schema/tenant-budgets.ts';
import { usageLedger } from '../db/schema/usage-ledger.ts';
import { getModelPrice } from '../domain/model-pricing.ts';

/**
 * Side-effects for budget alerting, injected so the recorder stays decoupled from
 * @seta/identity and @seta/notifications (their schemas are absent from the billing
 * test DB). Wired to the real implementations in register.ts; tests pass doubles.
 */
export interface RecorderAlertDeps {
  /** User ids to notify when a tenant crosses a budget threshold. */
  listTenantAdmins(tenantId: string): Promise<string[]>;
  /** Enqueue a notification (deduped on source_event_id at the notifier). */
  notify(input: {
    tenant_id: string;
    event_type: string;
    user_ids: string[];
    payload: Record<string, unknown>;
    source_event_id: string;
  }): Promise<void>;
}

const THRESHOLDS = [80, 100] as const;

function fixed10(n: number): string {
  return n.toFixed(10);
}

/**
 * After counters are updated, check each configured period limit. For every freshly
 * crossed threshold (the budget_alerts insert is the dedup key — one row per
 * tenant/period/threshold), notify the tenant's org admins exactly once.
 */
async function maybeAlert(
  ctx: SubscriberCtx,
  deps: RecorderAlertDeps,
  tenantId: string,
  day: string,
  month: string,
): Promise<void> {
  const [budget] = await ctx.tx
    .select()
    .from(tenantBudgets)
    .where(eq(tenantBudgets.tenantId, tenantId))
    .limit(1);
  if (!budget) return;

  const periods: Array<['day' | 'month', string, string | null]> = [
    ['day', day, budget.dailyLimit],
    ['month', month, budget.monthlyLimit],
  ];

  for (const [periodType, periodKey, limit] of periods) {
    if (limit == null) continue;
    const [counter] = await ctx.tx
      .select({ spend: budgetCounters.spend })
      .from(budgetCounters)
      .where(
        and(
          eq(budgetCounters.tenantId, tenantId),
          eq(budgetCounters.periodType, periodType),
          eq(budgetCounters.periodKey, periodKey),
        ),
      )
      .limit(1);
    if (!counter) continue;
    const pct = (Number(counter.spend) / Number(limit)) * 100;

    for (const threshold of THRESHOLDS) {
      if (pct < threshold) continue;
      const ins = await ctx.tx
        .insert(budgetAlerts)
        .values({ tenantId, periodType, periodKey, threshold })
        .onConflictDoNothing({
          target: [
            budgetAlerts.tenantId,
            budgetAlerts.periodType,
            budgetAlerts.periodKey,
            budgetAlerts.threshold,
          ],
        })
        .returning({ threshold: budgetAlerts.threshold });
      if (ins.length === 0) continue; // already alerted this threshold/period

      const admins = await deps.listTenantAdmins(tenantId);
      if (admins.length === 0) continue;
      const human = periodType === 'day' ? 'daily' : 'monthly';
      await deps.notify({
        tenant_id: tenantId,
        event_type: 'billing.budget.threshold',
        user_ids: admins,
        // Period-stable id: dedupes at the notifier across the whole period too.
        source_event_id: `budget:${tenantId}:${periodType}:${periodKey}:${threshold}`,
        payload: {
          title:
            threshold >= 100 ? `AI ${human} budget reached` : `AI ${human} budget at ${threshold}%`,
          body:
            threshold >= 100
              ? `Your tenant has reached its ${human} AI budget. New requests are blocked until the next period or a higher limit.`
              : `Your tenant has used ${Math.floor(pct)}% of its ${human} AI budget.`,
          period_type: periodType,
          threshold,
        },
      });
    }
  }
}

async function handle(
  event: DomainEvent<BillingUsageObservedPayload>,
  ctx: SubscriberCtx,
  alertDeps: RecorderAlertDeps | undefined,
): Promise<void> {
  const p = event.payload;
  const priceRow = await getModelPrice(p.model_key);
  if (!priceRow) {
    console.warn('[billing.pricing.unknown-model]', { modelKey: p.model_key });
  }
  const price = priceRow ?? { in: 0, out: 0 };
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

  // 3) Soft/hard budget alerting (best-effort; only when wired by register.ts).
  if (alertDeps) await maybeAlert(ctx, alertDeps, event.tenantId, day, month);
}

export function usageRecorderSubscriber(
  alertDeps?: RecorderAlertDeps,
): SubscriberDef<BillingUsageObservedPayload> {
  return {
    subscription: 'billing.usage.recorder',
    event: BILLING_USAGE_OBSERVED,
    eventVersion: BILLING_USAGE_OBSERVED_VERSION,
    handler: (event, ctx) => handle(event, ctx, alertDeps),
  };
}
