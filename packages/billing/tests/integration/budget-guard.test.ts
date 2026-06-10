import { describe, expect, it } from 'vitest';
import { createBillingBudgetGuard } from '../../src/backend/budget-guard.ts';
import { billingDb } from '../../src/backend/db/client.ts';
import { budgetCounters } from '../../src/backend/db/schema/budget-counters.ts';
import { tenantBudgets } from '../../src/backend/db/schema/tenant-budgets.ts';
import { periodKeys } from '../../src/period.ts';
import { withBillingTestDb } from './test-helpers.ts';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const guard = createBillingBudgetGuard();

async function setSpend(periodType: 'day' | 'month', spend: string) {
  const { day, month } = periodKeys(new Date());
  await billingDb()
    .insert(budgetCounters)
    .values({
      tenantId: TENANT,
      periodType,
      periodKey: periodType === 'day' ? day : month,
      spend,
    })
    .onConflictDoUpdate({
      target: [budgetCounters.tenantId, budgetCounters.periodType, budgetCounters.periodKey],
      set: { spend },
    });
}

describe('billing budget guard', () => {
  it('allows when no budget row exists (unlimited)', async () => {
    await withBillingTestDb(async () => {
      await setSpend('day', '999');
      expect(await guard.check(TENANT)).toEqual({ blocked: false });
    });
  });

  it('blocks on day when daily spend >= daily limit', async () => {
    await withBillingTestDb(async () => {
      await billingDb().insert(tenantBudgets).values({ tenantId: TENANT, dailyLimit: '10' });
      await setSpend('day', '10');
      expect(await guard.check(TENANT)).toEqual({ blocked: true, reason: 'day' });
    });
  });

  it('blocks on month when monthly spend >= monthly limit', async () => {
    await withBillingTestDb(async () => {
      await billingDb().insert(tenantBudgets).values({ tenantId: TENANT, monthlyLimit: '100' });
      await setSpend('month', '100');
      expect(await guard.check(TENANT)).toEqual({ blocked: true, reason: 'month' });
    });
  });

  it('allows below both limits', async () => {
    await withBillingTestDb(async () => {
      await billingDb()
        .insert(tenantBudgets)
        .values({ tenantId: TENANT, dailyLimit: '10', monthlyLimit: '100' });
      await setSpend('day', '5');
      await setSpend('month', '50');
      expect(await guard.check(TENANT)).toEqual({ blocked: false });
    });
  });

  it('NULL limit means unlimited for that period', async () => {
    await withBillingTestDb(async () => {
      await billingDb()
        .insert(tenantBudgets)
        .values({ tenantId: TENANT, dailyLimit: null, monthlyLimit: '100' });
      await setSpend('day', '9999');
      await setSpend('month', '50');
      expect(await guard.check(TENANT)).toEqual({ blocked: false });
    });
  });
});
