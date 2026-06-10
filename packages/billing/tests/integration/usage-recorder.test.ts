import { emit, withEmit } from '@seta/core/events';
import type { DomainEvent, SubscriberCtx } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import { budgetCounters } from '../../src/backend/db/schema/budget-counters.ts';
import { usageLedger } from '../../src/backend/db/schema/usage-ledger.ts';
import { setModelPrice } from '../../src/backend/domain/model-pricing.ts';
import { usageRecorderSubscriber } from '../../src/backend/subscribers/usage-recorder.ts';
import {
  BILLING_USAGE_OBSERVED,
  BILLING_USAGE_OBSERVED_VERSION,
  type BillingUsageObservedPayload,
} from '../../src/events.ts';
import { waitFor, withBillingTestDb, withDispatcher } from './test-helpers.ts';

describe('usage recorder', () => {
  it('records one ledger row and increments day+month counters', async () => {
    await withBillingTestDb(async ({ pool, db }) => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();

      await withDispatcher(
        { subscribers: [usageRecorderSubscriber() as never], pool },
        async () => {
          await withEmit({ actor: { userId: 'system', tenantId } }, async () => {
            await emit<BillingUsageObservedPayload>({
              tenantId,
              aggregateType: 'billing.usage',
              aggregateId: userId,
              eventType: BILLING_USAGE_OBSERVED,
              eventVersion: BILLING_USAGE_OBSERVED_VERSION,
              payload: {
                feature: 'chat',
                provider: 'openai',
                model_key: 'openai/gpt-5.5',
                tokens_in: 1000,
                tokens_out: 500,
                caused_by_user_id: userId,
              },
            });
          });

          await waitFor(async () => {
            const rows = await db.select().from(usageLedger);
            return rows.length === 1;
          });
        },
      );

      const rows = await db.select().from(usageLedger);
      expect(rows).toHaveLength(1);
      // cost = 1000*0.00000125 + 500*0.00001 = 0.00125 + 0.005 = 0.00625
      expect(Number(rows[0].cost)).toBeCloseTo(0.00625, 10);
      expect(rows[0].unitPriceIn).toBe('0.0000012500');
      expect(rows[0].causedByUserId).toBe(userId);
      expect(rows[0].periodMonth).toBe(rows[0].periodDay.slice(0, 7));

      const counters = await db.select().from(budgetCounters);
      expect(counters).toHaveLength(2); // one day, one month
      for (const c of counters) expect(Number(c.spend)).toBeCloseTo(0.00625, 10);
      expect(counters.map((c) => c.periodType).sort()).toEqual(['day', 'month']);
    });
  });

  it('prices a usage event from the model_pricing table', async () => {
    await withBillingTestDb(async ({ pool, db }) => {
      const tenantId = crypto.randomUUID();
      // Price a model that is NOT in the seed, so cost is unambiguously from this row.
      await setModelPrice({ modelKey: 'openai/gpt-5.4-mini', in: 0.000001, out: 0.000002 });

      await withDispatcher(
        { subscribers: [usageRecorderSubscriber() as never], pool },
        async () => {
          await withEmit({ actor: { userId: 'system', tenantId } }, async () => {
            await emit<BillingUsageObservedPayload>({
              tenantId,
              aggregateType: 'billing.usage',
              aggregateId: tenantId,
              eventType: BILLING_USAGE_OBSERVED,
              eventVersion: BILLING_USAGE_OBSERVED_VERSION,
              payload: {
                feature: 'chat',
                provider: 'openai',
                model_key: 'openai/gpt-5.4-mini',
                tokens_in: 1000,
                tokens_out: 500,
                caused_by_user_id: null,
              },
            });
          });

          await waitFor(async () => {
            const rows = await db.select().from(usageLedger);
            return rows.length === 1;
          });
        },
      );

      const [row] = await db.select().from(usageLedger);
      // 1000*0.000001 + 500*0.000002 = 0.001 + 0.001 = 0.002
      expect(Number(row.cost)).toBeCloseTo(0.002, 10);
      expect(Number(row.unitPriceIn)).toBeCloseTo(0.000001, 10);
    });
  });

  it('is idempotent — redelivering the same source_event_id does not double-count', async () => {
    await withBillingTestDb(async ({ db }) => {
      const tenantId = crypto.randomUUID();
      const eventId = crypto.randomUUID();
      const payload: BillingUsageObservedPayload = {
        feature: 'embedding',
        provider: 'openai',
        model_key: 'openai/text-embedding-3-small',
        tokens_in: 10_000,
        tokens_out: 0,
        caused_by_user_id: null,
      };
      const event: DomainEvent<BillingUsageObservedPayload> = {
        id: eventId,
        occurredAt: new Date('2026-06-10T12:00:00.000Z'),
        tenantId,
        aggregateType: 'billing.usage',
        aggregateId: tenantId,
        eventType: BILLING_USAGE_OBSERVED,
        eventVersion: BILLING_USAGE_OBSERVED_VERSION,
        payload,
      };

      const { handler } = usageRecorderSubscriber();
      // Two separate transactions carrying the SAME event id == redelivery.
      const runOnce = () =>
        (db as NodePgDatabase<Record<string, unknown>>).transaction(async (tx) =>
          handler(event, { tx } as SubscriberCtx),
        );
      await runOnce();
      await runOnce();

      const rows = await db
        .select()
        .from(usageLedger)
        .where(eq(usageLedger.sourceEventId, eventId));
      expect(rows).toHaveLength(1);

      const dayCounter = await db
        .select()
        .from(budgetCounters)
        .where(eq(budgetCounters.periodType, 'day'));
      // 10_000 * 0.00000002 = 0.0002 — counted once only.
      expect(dayCounter).toHaveLength(1);
      expect(Number(dayCounter[0].spend)).toBeCloseTo(0.0002, 10);
    });
  });
});
