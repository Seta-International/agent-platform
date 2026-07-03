import { textEnum, textEnumCheck } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import { jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { integrations } from './_integrations-schema.ts';
import { m365PlanLinks } from './m365-plan-links.ts';

export const RESOURCE_TYPES = [
  'plan',
  'planDetails',
  'bucket',
  'task',
  'taskDetails',
  'bucketTaskBoardTaskFormat',
  'assignment',
] as const;

export const m365ResourceEtags = integrations.table(
  'm365_resource_etags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    planLinkId: uuid('plan_link_id')
      .notNull()
      .references(() => m365PlanLinks.id, { onDelete: 'cascade' }),
    resourceType: textEnum('resource_type', RESOURCE_TYPES).notNull(),
    platform_id: text('platform_id').notNull(),
    externalId: text('external_id').notNull(),
    etag: text('etag').notNull(),
    lastSyncedFields: jsonb('last_synced_fields').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('m365_resource_etags_uniq').on(
      t.tenantId,
      t.planLinkId,
      t.resourceType,
      t.platform_id,
    ),
    textEnumCheck('m365_resource_etags', 'resource_type', RESOURCE_TYPES),
  ],
);
