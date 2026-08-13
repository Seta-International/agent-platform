import { sql } from 'drizzle-orm';
import { index, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

/**
 * One row per completed governed mutation. A replay of the same (tenant, key)
 * returns `result` instead of executing again.
 *
 * The composite primary key and the RLS policy are ONE decision: with a key-only
 * primary key, tenant B could not read tenant A's row (RLS filters it) but would
 * still collide with it on insert — leaking existence and breaking replay, which
 * would see zero rows, conclude "not yet written", then fail on insert.
 *
 * `result` holds a compact reference (id, kind, affected ids) — never the whole
 * entity, so this table never becomes a shadow copy of the data. No foreign keys:
 * module-boundary rule.
 */
export const mutationIdempotency = core.table(
  'mutation_idempotency',
  {
    tenant_id: uuid('tenant_id').notNull(),
    key: text('key').notNull(),
    mutation_kind: text('mutation_kind').notNull(),
    result: jsonb('result').notNull().$type<Record<string, unknown>>(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.key] }),
    index('mutation_idempotency_tenant_created_idx').on(t.tenant_id, t.created_at),
  ],
);
