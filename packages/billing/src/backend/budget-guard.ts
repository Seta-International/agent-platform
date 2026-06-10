import type { BudgetGuard, BudgetStatus } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import { periodKeys } from '../period.ts';
import { billingDb } from './db/client.ts';
import { budgetCounters } from './db/schema/budget-counters.ts';
import { tenantBudgets } from './db/schema/tenant-budgets.ts';

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

export function createBillingBudgetGuard(): BudgetGuard {
  return {
    async check(tenantId: string): Promise<BudgetStatus> {
      const [budget] = await billingDb()
        .select()
        .from(tenantBudgets)
        .where(eq(tenantBudgets.tenantId, tenantId))
        .limit(1);
      if (!budget) return { blocked: false }; // no row = unlimited

      const { day, month } = periodKeys(new Date());

      if (budget.dailyLimit != null) {
        const daySpend = await spendFor(tenantId, 'day', day);
        if (daySpend >= Number(budget.dailyLimit)) return { blocked: true, reason: 'day' };
      }
      if (budget.monthlyLimit != null) {
        const monthSpend = await spendFor(tenantId, 'month', month);
        if (monthSpend >= Number(budget.monthlyLimit)) return { blocked: true, reason: 'month' };
      }
      return { blocked: false };
    },
  };
}
