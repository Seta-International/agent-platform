import { sql } from 'drizzle-orm';
import { jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

// tenant_id NULL = global default row. Two partial unique indexes keep the
// (key, tenant) identity unique for both the tenant rows and the single
// null-tenant row, which a composite PK cannot express because PK columns
// must be NOT NULL.
export const coreFeatureFlags = core.table(
  'feature_flags',
  {
    key: text('key').notNull(),
    tenant_id: uuid('tenant_id'),
    strategies: jsonb('strategies')
      .notNull()
      .$type<{ kind: string; config?: Record<string, unknown> }[]>()
      .default(sql`'[]'::jsonb`),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updated_by: uuid('updated_by'),
  },
  (t) => [
    uniqueIndex('feature_flags_tenant_key')
      .on(t.tenant_id, t.key)
      .where(sql`tenant_id IS NOT NULL`),
    uniqueIndex('feature_flags_global_key').on(t.key).where(sql`tenant_id IS NULL`),
  ],
);
