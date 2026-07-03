import { textEnum, textEnumCheck } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import { index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { integrations, SYNC_STATUS } from './_integrations-schema.ts';

export const m365GroupLinks = integrations.table(
  'm365_group_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    groupId: uuid('group_id').notNull(),
    externalId: text('external_id').notNull(),
    deltaLink: text('delta_link'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).defaultNow().notNull(),
    lastSyncedFields: jsonb('last_synced_fields').notNull(),
    syncStatus: textEnum('sync_status', SYNC_STATUS).notNull().default('idle'),
    lastError: text('last_error'),
    unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('m365_group_links_uniq_group_live')
      .on(t.tenantId, t.groupId)
      .where(sql`unlinked_at IS NULL`),
    uniqueIndex('m365_group_links_uniq_external_live')
      .on(t.tenantId, t.externalId)
      .where(sql`unlinked_at IS NULL`),
    index('m365_group_links_by_status').on(t.tenantId, t.syncStatus),
    textEnumCheck('m365_group_links', 'sync_status', SYNC_STATUS),
  ],
);

export const m365Subscriptions = integrations.table(
  'm365_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    subscriptionId: text('subscription_id').notNull(),
    resource: text('resource').notNull(),
    changeType: text('change_type').notNull(),
    expirationAt: timestamp('expiration_at', { withTimezone: true }).notNull(),
    clientStateHmac: text('client_state_hmac').notNull(),
    renewalJobId: text('renewal_job_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('m365_subscriptions_uniq_tenant_resource').on(t.tenantId, t.resource)],
);
