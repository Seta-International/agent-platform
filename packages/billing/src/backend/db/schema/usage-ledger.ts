import { date, index, integer, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { billing } from './_billing-schema.ts';

/**
 * Append-only ledger: one row per LLM/embedding call. `source_event_id` is the
 * outbox event_id and is UNIQUE — the recorder uses it for idempotency.
 * Unit prices are snapshotted here so historical cost never changes (AC2).
 */
export const usageLedger = billing.table(
  'usage_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    sourceEventId: uuid('source_event_id').notNull().unique(),
    feature: text('feature').notNull(),
    provider: text('provider').notNull(),
    modelKey: text('model_key').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    unitPriceIn: numeric('unit_price_in', { precision: 20, scale: 10 }).notNull(),
    unitPriceOut: numeric('unit_price_out', { precision: 20, scale: 10 }).notNull(),
    cost: numeric('cost', { precision: 20, scale: 10 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    causedByUserId: uuid('caused_by_user_id'),
    periodDay: date('period_day').notNull(),
    periodMonth: text('period_month').notNull(),
  },
  (t) => ({
    byTenantTime: index('usage_ledger_by_tenant_time').on(t.tenantId, t.occurredAt),
    byTenantMonth: index('usage_ledger_by_tenant_month').on(t.tenantId, t.periodMonth),
  }),
);
