import { and, eq, sql } from 'drizzle-orm';
import { periodKeys } from '../../period.ts';
import { billingDb } from '../db/client.ts';
import { budgetCounters } from '../db/schema/budget-counters.ts';
import { tenantBudgets } from '../db/schema/tenant-budgets.ts';
import { usageLedger } from '../db/schema/usage-ledger.ts';

export interface PeriodUsage {
  spend: number;
  limit: number | null;
}
export interface UsageBreakdownRow {
  feature: string;
  modelKey: string;
  cost: number;
}
export interface TenantUsage {
  currency: string;
  day: PeriodUsage;
  month: PeriodUsage;
  breakdown: UsageBreakdownRow[];
}

async function spendFor(
  tenantId: string,
  periodType: 'day' | 'month',
  periodKey: string,
): Promise<number> {
  const [row] = await billingDb()
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
  return row ? Number(row.spend) : 0;
}

export async function getTenantUsage(tenantId: string): Promise<TenantUsage> {
  const { day, month } = periodKeys(new Date());
  const db = billingDb();

  const [budget] = await db
    .select()
    .from(tenantBudgets)
    .where(eq(tenantBudgets.tenantId, tenantId))
    .limit(1);

  const daySpend = await spendFor(tenantId, 'day', day);
  const monthSpend = await spendFor(tenantId, 'month', month);

  const breakdownRows = await db
    .select({
      feature: usageLedger.feature,
      modelKey: usageLedger.modelKey,
      cost: sql<string>`sum(${usageLedger.cost})`,
    })
    .from(usageLedger)
    .where(and(eq(usageLedger.tenantId, tenantId), eq(usageLedger.periodMonth, month)))
    .groupBy(usageLedger.feature, usageLedger.modelKey);

  return {
    currency: budget?.currency ?? 'USD',
    day: { spend: daySpend, limit: budget?.dailyLimit != null ? Number(budget.dailyLimit) : null },
    month: {
      spend: monthSpend,
      limit: budget?.monthlyLimit != null ? Number(budget.monthlyLimit) : null,
    },
    breakdown: breakdownRows.map((r) => ({
      feature: r.feature,
      modelKey: r.modelKey,
      cost: Number(r.cost),
    })),
  };
}
