import { numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { billing } from './_billing-schema.ts';

/** Operator-set caps. NULL limit = unlimited for that period. No row = unlimited. */
export const tenantBudgets = billing.table('tenant_budgets', {
  tenantId: uuid('tenant_id').primaryKey(),
  dailyLimit: numeric('daily_limit', { precision: 20, scale: 10 }),
  monthlyLimit: numeric('monthly_limit', { precision: 20, scale: 10 }),
  currency: text('currency').notNull().default('USD'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
