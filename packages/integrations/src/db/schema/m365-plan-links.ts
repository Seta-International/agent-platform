import { sql } from 'drizzle-orm';
import { check, index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { integrations } from './_integrations-schema.ts';

export const m365PlanLinks = integrations.table(
  'm365_plan_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    groupId: uuid('group_id').notNull(),
    planId: uuid('plan_id').notNull(),
    externalId: text('external_id').notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).defaultNow().notNull(),
    lastSyncedSnapshot: jsonb('last_synced_snapshot').default(sql`'{}'::jsonb`).notNull(),
    syncStatus: text('sync_status').notNull().default('idle'),
    lastError: text('last_error'),
    lastReconcileAt: timestamp('last_reconcile_at', { withTimezone: true }),
    unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('m365_plan_links_uniq_plan_live')
      .on(t.tenantId, t.planId)
      .where(sql`unlinked_at IS NULL`),
    uniqueIndex('m365_plan_links_uniq_external_live')
      .on(t.tenantId, t.externalId)
      .where(sql`unlinked_at IS NULL`),
    index('m365_plan_links_by_group_live')
      .on(t.tenantId, t.groupId)
      .where(sql`unlinked_at IS NULL`),
    check(
      'm365_plan_links_status_check',
      sql`sync_status IN ('idle','pulling','pushing','error','conflict')`,
    ),
  ],
);
