import { integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { billing } from './_billing-schema.ts';

/**
 * One row per (tenant, period, threshold) that has already alerted.
 * Insert with ON CONFLICT DO NOTHING — a successful insert means "first crossing"
 * and is the signal to send a notification. Idempotent across redelivery.
 */
export const budgetAlerts = billing.table(
  'budget_alerts',
  {
    tenantId: uuid('tenant_id').notNull(),
    periodType: text('period_type').notNull(), // 'day' | 'month'
    periodKey: text('period_key').notNull(),
    threshold: integer('threshold').notNull(), // 80 | 100
    alertedAt: timestamp('alerted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.periodType, t.periodKey, t.threshold] })],
);
