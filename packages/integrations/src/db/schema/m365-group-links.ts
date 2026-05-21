import { sql } from 'drizzle-orm';
import { check, index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { integrations } from './_integrations-schema.ts';

export const m365GroupLinks = integrations.table(
  'm365_group_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    group_id: uuid('group_id').notNull(),
    external_id: text('external_id').notNull(),
    delta_link: text('delta_link'),
    last_synced_at: timestamp('last_synced_at', { withTimezone: true }).defaultNow().notNull(),
    last_synced_fields: jsonb('last_synced_fields').notNull(),
    sync_status: text('sync_status').notNull().default('idle'),
    last_error: text('last_error'),
    unlinked_at: timestamp('unlinked_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('m365_group_links_uniq_group_live')
      .on(t.tenant_id, t.group_id)
      .where(sql`unlinked_at IS NULL`),
    uniqueIndex('m365_group_links_uniq_external_live')
      .on(t.tenant_id, t.external_id)
      .where(sql`unlinked_at IS NULL`),
    index('m365_group_links_by_status').on(t.tenant_id, t.sync_status),
    check(
      'm365_group_links_status_check',
      sql`sync_status IN ('idle','pulling','pushing','error','conflict')`,
    ),
  ],
);

export const m365Subscriptions = integrations.table(
  'm365_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    subscription_id: text('subscription_id').notNull(),
    resource: text('resource').notNull(),
    change_type: text('change_type').notNull(),
    expiration_at: timestamp('expiration_at', { withTimezone: true }).notNull(),
    client_state_hmac: text('client_state_hmac').notNull(),
    renewal_job_id: text('renewal_job_id'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('m365_subscriptions_uniq_tenant_resource').on(t.tenant_id, t.resource)],
);
