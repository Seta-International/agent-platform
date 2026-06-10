import { numeric, text, timestamp } from 'drizzle-orm/pg-core';
import { billing } from './_billing-schema.ts';

/**
 * Global per-model unit prices in USD/token. One current row per model
 * (the ledger snapshots historical cost, so no price history is needed).
 * Operator-managed via the billing-pricing CLI; read-only in the web UI.
 */
export const modelPricing = billing.table('model_pricing', {
  modelKey: text('model_key').primaryKey(),
  unitPriceIn: numeric('unit_price_in', { precision: 20, scale: 10 }).notNull(),
  unitPriceOut: numeric('unit_price_out', { precision: 20, scale: 10 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
