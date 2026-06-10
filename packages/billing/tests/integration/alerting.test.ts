import { emit, withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { budgetAlerts } from '../../src/backend/db/schema/budget-alerts.ts';
import { tenantBudgets } from '../../src/backend/db/schema/tenant-budgets.ts';
import { usageLedger } from '../../src/backend/db/schema/usage-ledger.ts';
import {
  type RecorderAlertDeps,
  usageRecorderSubscriber,
} from '../../src/backend/subscribers/usage-recorder.ts';
import {
  BILLING_USAGE_OBSERVED,
  BILLING_USAGE_OBSERVED_VERSION,
  type BillingUsageObservedPayload,
} from '../../src/events.ts';
import { waitFor, withBillingTestDb, withDispatcher } from './test-helpers.ts';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const ADMIN = '00000000-0000-0000-0000-0000000000a1';

// openai/gpt-5.5 output price is 0.00001/token, so cost == tokensOut * 0.00001.
function emitUsage(tokensOut: number): Promise<void> {
  return withEmit({ actor: { userId: 'system', tenantId: TENANT } }, async () => {
    await emit<BillingUsageObservedPayload>({
      tenantId: TENANT,
      aggregateType: 'billing.usage',
      aggregateId: TENANT,
      eventType: BILLING_USAGE_OBSERVED,
      eventVersion: BILLING_USAGE_OBSERVED_VERSION,
      payload: {
        feature: 'chat',
        provider: 'openai',
        model_key: 'openai/gpt-5.5',
        tokens_in: 0,
        tokens_out: tokensOut,
        caused_by_user_id: null,
      },
    });
  });
}

describe('budget alerting', () => {
  it('alerts at 80% once, then 100%, notifying org admins each crossing', async () => {
    await withBillingTestDb(async ({ pool, db }) => {
      // Daily cap so 80% = 0.0008, 100% = 0.001.
      await db.insert(tenantBudgets).values({ tenantId: TENANT, dailyLimit: '0.001' });

      const notified: Array<{
        source_event_id: string;
        period_type: string;
        threshold: number;
        user_ids: string[];
      }> = [];
      const deps: RecorderAlertDeps = {
        listTenantAdmins: async () => [ADMIN],
        notify: async (input) => {
          notified.push({
            source_event_id: input.source_event_id,
            period_type: String(input.payload.period_type),
            threshold: Number(input.payload.threshold),
            user_ids: input.user_ids,
          });
        },
      };

      await withDispatcher(
        { subscribers: [usageRecorderSubscriber(deps) as never], pool },
        async () => {
          // ~85% → crosses 80 only.
          await emitUsage(85);
          await waitFor(async () => (await db.select().from(usageLedger)).length === 1);
          let alerts = await db
            .select()
            .from(budgetAlerts)
            .where(eq(budgetAlerts.periodType, 'day'));
          expect(alerts.map((a) => a.threshold)).toEqual([80]);

          // ~90% (same period, still < 100%) → no new alert.
          await emitUsage(5);
          await waitFor(async () => (await db.select().from(usageLedger)).length === 2);
          alerts = await db.select().from(budgetAlerts).where(eq(budgetAlerts.periodType, 'day'));
          expect(alerts.map((a) => a.threshold).sort((x, y) => x - y)).toEqual([80]);

          // ~110% → adds a 100 alert; still only one 80.
          await emitUsage(20);
          await waitFor(async () => (await db.select().from(usageLedger)).length === 3);
          alerts = await db.select().from(budgetAlerts).where(eq(budgetAlerts.periodType, 'day'));
          expect(alerts.map((a) => a.threshold).sort((x, y) => x - y)).toEqual([80, 100]);
        },
      );

      const dayNotifs = notified.filter((n) => n.period_type === 'day');
      expect(dayNotifs.map((n) => n.threshold).sort((a, b) => a - b)).toEqual([80, 100]);
      for (const n of dayNotifs) expect(n.user_ids).toEqual([ADMIN]);
    });
  });

  it('notifies with a UUID source_event_id (notifications.source_event_id is uuid-typed)', async () => {
    // Regression: billing used to pass a synthetic string `budget:<tenant>:day:...`
    // as source_event_id. The notifier inserts that into a uuid column, so the
    // insert was rejected and the in-app alert was silently never created.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    await withBillingTestDb(async ({ pool, db }) => {
      await db.insert(tenantBudgets).values({ tenantId: TENANT, dailyLimit: '0.001' });

      const ids: string[] = [];
      const deps: RecorderAlertDeps = {
        listTenantAdmins: async () => [ADMIN],
        notify: async (input) => {
          ids.push(input.source_event_id);
        },
      };

      await withDispatcher(
        { subscribers: [usageRecorderSubscriber(deps) as never], pool },
        async () => {
          await emitUsage(85); // crosses 80% (day)
          await waitFor(async () => (await db.select().from(usageLedger)).length === 1);
        },
      );

      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(id).toMatch(UUID_RE);
    });
  });

  it('does not alert when no budget is configured', async () => {
    await withBillingTestDb(async ({ pool, db }) => {
      const notified: unknown[] = [];
      const deps: RecorderAlertDeps = {
        listTenantAdmins: async () => [ADMIN],
        notify: async (input) => {
          notified.push(input);
        },
      };

      await withDispatcher(
        { subscribers: [usageRecorderSubscriber(deps) as never], pool },
        async () => {
          await emitUsage(100_000); // large spend, but no tenant_budgets row
          await waitFor(async () => (await db.select().from(usageLedger)).length === 1);
        },
      );

      const alerts = await db.select().from(budgetAlerts);
      expect(alerts).toHaveLength(0);
      expect(notified).toHaveLength(0);
    });
  });
});
