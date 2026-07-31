import { textEnum, textEnumCheck } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import { index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { integrations, SYNC_STATUS } from './_integrations-schema.ts';

export const ORG_UNIT_LINK_KINDS = ['division', 'department'] as const;
export const DIRECTORY_CONFLICT_KINDS = [
  'manager_ambiguous',
  'email_collision',
  'unit_delete_blocked',
  'spine_collision',
  'user_removed',
] as const;
export const DIRECTORY_CONFLICT_STATUS = ['open', 'resolved', 'ignored'] as const;
export const CONFLICT_SUBJECT_TYPES = ['person', 'org_unit'] as const;

export type OrgUnitLinkKind = (typeof ORG_UNIT_LINK_KINDS)[number];
export type DirectoryConflictKind = (typeof DIRECTORY_CONFLICT_KINDS)[number];
export type DirectoryConflictStatus = (typeof DIRECTORY_CONFLICT_STATUS)[number];
export type ConflictSubjectType = (typeof CONFLICT_SUBJECT_TYPES)[number];

// person_id / org_unit_id are bare uuids: cross-schema FKs are disallowed.
export const m365PersonLinks = integrations.table(
  'm365_person_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    personId: uuid('person_id').notNull(),
    entraOid: uuid('entra_oid').notNull(),
    managerOid: uuid('manager_oid'),
    department: text('department'),
    division: text('division'),
    photoMediaEtag: text('photo_media_etag'),
    syncStatus: textEnum('sync_status', SYNC_STATUS).notNull().default('idle'),
    lastError: text('last_error'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('m365_person_links_uniq_oid').on(t.tenantId, t.entraOid),
    uniqueIndex('m365_person_links_uniq_person').on(t.tenantId, t.personId),
    index('m365_person_links_by_manager').on(t.tenantId, t.managerOid),
    textEnumCheck('m365_person_links', 'sync_status', SYNC_STATUS),
  ],
);

export const m365OrgUnitLinks = integrations.table(
  'm365_org_unit_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    orgUnitId: uuid('org_unit_id').notNull(),
    entraKey: text('entra_key').notNull(),
    kind: textEnum('kind', ORG_UNIT_LINK_KINDS).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('m365_org_unit_links_uniq_key').on(t.tenantId, t.entraKey),
    uniqueIndex('m365_org_unit_links_uniq_unit').on(t.tenantId, t.orgUnitId),
    textEnumCheck('m365_org_unit_links', 'kind', ORG_UNIT_LINK_KINDS),
  ],
);

export const m365DirectoryConflict = integrations.table(
  'm365_directory_conflict',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    kind: textEnum('kind', DIRECTORY_CONFLICT_KINDS).notNull(),
    subjectType: textEnum('subject_type', CONFLICT_SUBJECT_TYPES).notNull(),
    subjectId: uuid('subject_id'),
    entraOid: uuid('entra_oid'),
    detail: jsonb('detail').notNull(),
    status: textEnum('status', DIRECTORY_CONFLICT_STATUS).notNull().default('open'),
    resolution: jsonb('resolution'),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One open row per (kind, subject). Re-raising bumps last_seen_at instead of inserting.
    uniqueIndex('m365_directory_conflict_uniq_open')
      .on(t.tenantId, t.kind, t.subjectType, t.subjectId, t.entraOid)
      .where(sql`status = 'open'`),
    index('m365_directory_conflict_by_status').on(t.tenantId, t.status, t.kind),
    textEnumCheck('m365_directory_conflict', 'kind', DIRECTORY_CONFLICT_KINDS),
    textEnumCheck('m365_directory_conflict', 'subject_type', CONFLICT_SUBJECT_TYPES),
    textEnumCheck('m365_directory_conflict', 'status', DIRECTORY_CONFLICT_STATUS),
  ],
);
