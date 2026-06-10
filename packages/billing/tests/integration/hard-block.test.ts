import { describe, expect, it } from 'vitest';
import { createBillingBudgetGuard } from '../../src/backend/budget-guard.ts';
import { billingDb } from '../../src/backend/db/client.ts';
import { budgetCounters } from '../../src/backend/db/schema/budget-counters.ts';
import { tenantBudgets } from '../../src/backend/db/schema/tenant-budgets.ts';
import { periodKeys } from '../../src/period.ts';
import { withBillingTestDb } from './test-helpers.ts';

const TENANT = '00000000-0000-0000-0000-0000000000bb';

describe('hard block end-to-end (guard level)', () => {
  it('blocks once daily spend crosses a tiny daily limit', async () => {
    await withBillingTestDb(async () => {
      const guard = createBillingBudgetGuard();
      const { day } = periodKeys(new Date());

      // Tiny daily cap, spend pushed just over it.
      await billingDb().insert(tenantBudgets).values({ tenantId: TENANT, dailyLimit: '0.01' });
      await billingDb()
        .insert(budgetCounters)
        .values({ tenantId: TENANT, periodType: 'day', periodKey: day, spend: '0.0100001' });

      expect(await guard.check(TENANT)).toEqual({ blocked: true, reason: 'day' });
    });
  });

  it('still allows while spend is under the limit', async () => {
    await withBillingTestDb(async () => {
      const guard = createBillingBudgetGuard();
      const { day } = periodKeys(new Date());

      await billingDb().insert(tenantBudgets).values({ tenantId: TENANT, dailyLimit: '5' });
      await billingDb()
        .insert(budgetCounters)
        .values({ tenantId: TENANT, periodType: 'day', periodKey: day, spend: '1.5' });

      expect(await guard.check(TENANT)).toEqual({ blocked: false });
    });
  });
});
