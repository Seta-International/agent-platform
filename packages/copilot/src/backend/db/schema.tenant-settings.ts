import { integer, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
import { copilot } from './pg-schema.ts';

export const tenantSettings = copilot.table('tenant_settings', {
  tenantId: uuid('tenant_id').primaryKey(),
  dedupWeights: jsonb('dedup_weights')
    .notNull()
    .$type<{ semantic: number; vector: number; position: number }>(),
  dedupThresholds: jsonb('dedup_thresholds')
    .notNull()
    .$type<{ likelyDup: number; maybeDup: number }>(),
  assignmentWeights: jsonb('assignment_weights')
    .notNull()
    .$type<{ exact: number; vec: number; load: number; tz: number }>(),
  approvalTtlHours: integer('approval_ttl_hours').notNull().default(72),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type TenantSettingsRow = typeof tenantSettings.$inferSelect;
export type TenantSettingsInsert = typeof tenantSettings.$inferInsert;
