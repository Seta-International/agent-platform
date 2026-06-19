import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const hiringSchema = pgSchema('hiring');

export const requisition = hiringSchema.table(
  'requisition',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    title: text('title').notNull(),
    role_title: text('role_title'),
    grade: text('grade'),
    account_id: uuid('account_id'),
    resource_request_id: uuid('resource_request_id'),
    position_id: uuid('position_id'),
    kind: text('kind').notNull().default('new'),
    approval_status: text('approval_status').notNull().default('draft'),
    status: text('status').notNull().default('open'),
    stage: text('stage').notNull().default('sourcing'),
    jd: jsonb('jd'),
    owner_user_id: uuid('owner_user_id'),
    due_date: date('due_date'),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('requisition_uniq_resource_request')
      .on(t.tenant_id, t.resource_request_id)
      .where(sql`resource_request_id IS NOT NULL`),
    index('requisition_by_status_stage').on(t.tenant_id, t.status, t.stage),
    check('requisition_kind_check', sql`kind IN ('replacement','new')`),
    check(
      'requisition_approval_status_check',
      sql`approval_status IN ('draft','pending_approval','approved','rejected')`,
    ),
    check('requisition_status_check', sql`status IN ('open','on_hold','filled','cancelled')`),
    check('requisition_stage_check', sql`stage IN ('sourcing','screening','interview','offer')`),
  ],
);

export const candidate = hiringSchema.table('candidate', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  source: text('source'),
  contact: jsonb('contact'),
  dob: date('dob'),
  gender: text('gender'),
  cv_storage_key: text('cv_storage_key'),
  seniority: text('seniority'),
  segment: text('segment'),
  source_cost: numeric('source_cost'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const application = hiringSchema.table(
  'application',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    requisition_id: uuid('requisition_id').notNull(),
    kind: text('kind').notNull(),
    candidate_id: uuid('candidate_id'),
    worker_id: uuid('worker_id'),
    stage: text('stage'),
    status: text('status'),
    rating: integer('rating'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('application_uniq_candidate')
      .on(t.tenant_id, t.requisition_id, t.candidate_id)
      .where(sql`candidate_id IS NOT NULL`),
    uniqueIndex('application_uniq_worker')
      .on(t.tenant_id, t.requisition_id, t.worker_id)
      .where(sql`worker_id IS NOT NULL`),
    index('application_by_requisition').on(t.tenant_id, t.requisition_id),
    check('application_kind_check', sql`kind IN ('external','internal')`),
    check(
      'application_one_subject_check',
      sql`(candidate_id IS NOT NULL) <> (worker_id IS NOT NULL)`,
    ),
  ],
);
