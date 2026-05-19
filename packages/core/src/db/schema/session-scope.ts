import { boolean, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

export const sessionScopeCache = core.table('session_scope_cache', {
  session_id: text('session_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  user_id: uuid('user_id').notNull(),
  role_summary_hash: text('role_summary_hash').notNull(),
  role_summary: jsonb('role_summary').notNull(),
  accessible_group_ids: jsonb('accessible_group_ids').notNull(),
  cross_tenant_read: boolean('cross_tenant_read').default(false).notNull(),
  built_at: timestamp('built_at', { withTimezone: true }).defaultNow().notNull(),
  invalidated_at: timestamp('invalidated_at', { withTimezone: true }),
});
