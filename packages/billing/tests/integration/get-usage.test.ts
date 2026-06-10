import { describe, expect, it } from 'vitest';
import { budgetCounters } from '../../src/backend/db/schema/budget-counters.ts';
import { tenantBudgets } from '../../src/backend/db/schema/tenant-budgets.ts';
import { usageLedger } from '../../src/backend/db/schema/usage-ledger.ts';
import { getTenantUsage } from '../../src/backend/domain/get-usage.ts';
import { periodKeys } from '../../src/period.ts';
import { withBillingTestDb } from './test-helpers.ts';

const TENANT = '00000000-0000-0000-0000-0000000000aa';

describe('getTenantUsage', () => {
  it('returns day/month spend, limits, and breakdown', async () => {
    await withBillingTestDb(async ({ db }) => {
      const { day, month } = periodKeys(new Date());
      await db.insert(tenantBudgets).values({
        tenantId: TENANT,
        dailyLimit: '10',
        monthlyLimit: '100',
      });
      await db.insert(budgetCounters).values([
        { tenantId: TENANT, periodType: 'day', periodKey: day, spend: '2.5' },
        { tenantId: TENANT, periodType: 'month', periodKey: month, spend: '40' },
      ]);
      await db.insert(usageLedger).values([
        {
          tenantId: TENANT,
          sourceEventId: '00000000-0000-0000-0000-0000000000c1',
          feature: 'chat',
          provider: 'openai',
          modelKey: 'openai/gpt-5.5',
          tokensIn: 1000,
          tokensOut: 500,
          unitPriceIn: '0',
          unitPriceOut: '0',
          cost: '30',
          periodDay: day,
          periodMonth: month,
        },
        {
          tenantId: TENANT,
          sourceEventId: '00000000-0000-0000-0000-0000000000c2',
          feature: 'embedding',
          provider: 'openai',
          modelKey: 'openai/text-embedding-3-small',
          tokensIn: 5000,
          tokensOut: 0,
          unitPriceIn: '0',
          unitPriceOut: '0',
          cost: '10',
          periodDay: day,
          periodMonth: month,
        },
      ]);

      const usage = await getTenantUsage(TENANT);
      expect(usage.day).toEqual({ spend: 2.5, limit: 10 });
      expect(usage.month).toEqual({ spend: 40, limit: 100 });
      expect(usage.breakdown).toContainEqual({
        feature: 'chat',
        modelKey: 'openai/gpt-5.5',
        cost: 30,
      });
      expect(usage.breakdown).toContainEqual({
        feature: 'embedding',
        modelKey: 'openai/text-embedding-3-small',
        cost: 10,
      });
    });
  });

  it('returns null limits when no budget row exists', async () => {
    await withBillingTestDb(async () => {
      const usage = await getTenantUsage(TENANT);
      expect(usage.day.limit).toBeNull();
      expect(usage.month.limit).toBeNull();
    });
  });
});
