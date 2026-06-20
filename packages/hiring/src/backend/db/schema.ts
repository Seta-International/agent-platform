import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
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
    kind: text('kind').notNull().default('new'),
    approval_status: text('approval_status').notNull().default('draft'),
    status: text('status').notNull().default('open'),
    stage: text('stage').notNull().default('sourcing'),
    owner_user_id: uuid('owner_user_id'),
    due_date: date('due_date'),
    start_date: date('start_date'),
    note: text('note'),
    default_interview_mode: text('default_interview_mode'),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('requisition_by_status_stage').on(t.tenant_id, t.status, t.stage),
    index('requisition_by_account').on(t.tenant_id, t.account_id),
    check('requisition_kind_check', sql`kind IN ('replacement','new')`),
    check(
      'requisition_approval_status_check',
      sql`approval_status IN ('draft','pending_approval','approved','rejected')`,
    ),
    check('requisition_status_check', sql`status IN ('open','on_hold','filled','cancelled')`),
    check('requisition_stage_check', sql`stage IN ('sourcing','screening','interview','offer')`),
    check(
      'requisition_interview_mode_check',
      sql`default_interview_mode IS NULL OR default_interview_mode IN ('online','onsite','either')`,
    ),
  ],
);

export const opening = hiringSchema.table(
  'opening',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    requisition_id: uuid('requisition_id').notNull(),
    seq: integer('seq').notNull(),
    status: text('status').notNull().default('open'),
    close_reason_id: uuid('close_reason_id'),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    hired_application_id: uuid('hired_application_id'),
    resource_request_id: uuid('resource_request_id'),
    position_id: uuid('position_id'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('opening_uniq_seq').on(t.tenant_id, t.requisition_id, t.seq),
    uniqueIndex('opening_uniq_resource_request')
      .on(t.tenant_id, t.resource_request_id)
      .where(sql`resource_request_id IS NOT NULL`),
    index('opening_by_requisition').on(t.tenant_id, t.requisition_id),
    check('opening_status_check', sql`status IN ('open','filled','closed','cancelled')`),
  ],
);

export const requisitionJdSection = hiringSchema.table(
  'requisition_jd_section',
  {
    tenant_id: uuid('tenant_id').notNull(),
    requisition_id: uuid('requisition_id').notNull(),
    variant: text('variant').notNull(),
    section: text('section').notNull(),
    body: text('body').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.requisition_id, t.variant, t.section] }),
    check('jd_section_variant_check', sql`variant IN ('internal','external')`),
    check(
      'jd_section_section_check',
      sql`section IN ('about','responsibilities','requirements','nice_to_have')`,
    ),
  ],
);

export const requisitionSkill = hiringSchema.table(
  'requisition_skill',
  {
    tenant_id: uuid('tenant_id').notNull(),
    requisition_id: uuid('requisition_id').notNull(),
    skill_id: uuid('skill_id'),
    skill_name: text('skill_name').notNull(),
    min_level: integer('min_level'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.requisition_id, t.skill_name] })],
);

export const openingCloseReason = hiringSchema.table(
  'opening_close_reason',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    label: text('label').notNull(),
    active: boolean('active').notNull().default(true),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('close_reason_uniq_label').on(t.tenant_id, t.label)],
);

export const jdTemplate = hiringSchema.table(
  'jd_template',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('jd_template_uniq_name').on(t.tenant_id, t.name),
    check('jd_template_kind_check', sql`kind IN ('role','intro','closing')`),
  ],
);

export const jdTemplateSection = hiringSchema.table(
  'jd_template_section',
  {
    tenant_id: uuid('tenant_id').notNull(),
    template_id: uuid('template_id').notNull(),
    variant: text('variant').notNull(),
    section: text('section').notNull(),
    body: text('body').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.template_id, t.variant, t.section] }),
    check('jd_template_section_variant_check', sql`variant IN ('internal','external')`),
    check(
      'jd_template_section_section_check',
      sql`section IN ('about','responsibilities','requirements','nice_to_have')`,
    ),
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
