import { numeric, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { billing } from './_billing-schema.ts';

/**
 * Aggregated spend per tenant per period, for O(1) enforcement reads.
 * Upserted (+= cost) in the same transaction as the ledger insert.
 * A new period_key is a fresh row — that is the "reset".
 */
export const budgetCounters = billing.table(
  'budget_counters',
  {
    tenantId: uuid('tenant_id').notNull(),
    periodType: text('period_type').notNull(), // 'day' | 'month'
    periodKey: text('period_key').notNull(), // '2026-06-10' | '2026-06'
    spend: numeric('spend', { precision: 20, scale: 10 }).notNull().default('0'),
    currency: text('currency').notNull().default('USD'),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.periodType, t.periodKey] })],
);
