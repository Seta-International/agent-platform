import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
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

export const peopleSchema = pgSchema('people');

export const person = peopleSchema.table(
  'person',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    user_id: uuid('user_id'),
    original_hire_date: date('original_hire_date'),
    seniority_date: date('seniority_date'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('person_by_tenant_user').on(t.tenant_id, t.user_id)],
);

export const employmentPeriod = peopleSchema.table(
  'employment_period',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id').notNull(),
    seq: integer('seq').notNull(),
    start_date: date('start_date'),
    end_date: date('end_date'),
    status: text('status').notNull().default('active'),
    lifecycle_stage: text('lifecycle_stage').notNull().default('preboarding'),
    employment_type: text('employment_type'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('employment_period_uniq_seq').on(t.tenant_id, t.person_id, t.seq),
    uniqueIndex('employment_period_one_open').on(t.person_id).where(sql`end_date IS NULL`),
    index('employment_period_by_person').on(t.tenant_id, t.person_id),
    check(
      'employment_period_lifecycle_stage_check',
      sql`lifecycle_stage IN ('preboarding','onboarding','probation','active','on_leave','offboarding','alumni','did_not_start')`,
    ),
  ],
);

export const worker = peopleSchema.table(
  'worker',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id').notNull(),
    employee_no: text('employee_no'),
    full_name: text('full_name').notNull(),
    work_email: text('work_email'),
    dob: date('dob'),
    gender: text('gender'),
    phone: text('phone'),
    emergency_contact: jsonb('emergency_contact'),
    profile_completed_at: timestamp('profile_completed_at', { withTimezone: true }),
    portal_access: boolean('portal_access').notNull().default(false),
    job_title: text('job_title'),
    org_unit_id: uuid('org_unit_id'),
    manager_id: uuid('manager_id'),
    version: integer('version').default(1).notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('worker_uniq_person').on(t.person_id),
    uniqueIndex('worker_uniq_employee_no_per_tenant')
      .on(t.tenant_id, t.employee_no)
      .where(sql`employee_no IS NOT NULL AND deleted_at IS NULL`),
    uniqueIndex('worker_uniq_email_per_tenant')
      .on(t.tenant_id, t.work_email)
      .where(sql`work_email IS NOT NULL AND deleted_at IS NULL`),
    index('worker_by_tenant_live').on(t.tenant_id, t.deleted_at),
    index('worker_by_org_unit').on(t.tenant_id, t.org_unit_id),
    index('worker_by_manager').on(t.tenant_id, t.manager_id),
    check('worker_gender_check', sql`gender IN ('male','female','prefer_not_to_say')`),
  ],
);

export const orgUnit = peopleSchema.table(
  'org_unit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    parent_id: uuid('parent_id'),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    head_worker_id: uuid('head_worker_id'),
    sort: integer('sort').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('org_unit_by_parent').on(t.tenant_id, t.parent_id),
    index('org_unit_by_head').on(t.tenant_id, t.head_worker_id),
    foreignKey({
      columns: [t.parent_id],
      foreignColumns: [t.id],
      name: 'org_unit_parent_fk',
    }),
    check(
      'org_unit_kind_check',
      sql`kind IN ('executive','operation','function','delivery','pmo')`,
    ),
  ],
);

export const personSkill = peopleSchema.table(
  'person_skill',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id').notNull(),
    skill_id: uuid('skill_id').notNull(),
    skill_name: text('skill_name').notNull(),
    level: integer('level'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('person_skill_uniq').on(t.tenant_id, t.person_id, t.skill_id),
    index('person_skill_by_person').on(t.tenant_id, t.person_id),
    index('person_skill_by_skill').on(t.tenant_id, t.skill_id),
    foreignKey({
      columns: [t.person_id],
      foreignColumns: [person.id],
      name: 'person_skill_person_fk',
    }),
  ],
);

export const workerHistory = peopleSchema.table(
  'worker_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id').notNull(),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
    action: text('action').notNull(),
    field: text('field'),
    from_val: jsonb('from_val'),
    to_val: jsonb('to_val'),
    by_user_id: uuid('by_user_id'),
  },
  (t) => [index('worker_history_by_person').on(t.tenant_id, t.person_id, t.at)],
);

export const workerAllocationProjection = peopleSchema.table(
  'worker_allocation_projection',
  {
    allocation_id: uuid('allocation_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    worker_id: uuid('worker_id'),
    project_id: uuid('project_id').notNull(),
    account_id: uuid('account_id').notNull(),
    account_name: text('account_name').notNull(),
    lead_worker_id: uuid('lead_worker_id'),
    date_from: date('date_from'),
    date_to: date('date_to'),
    planned_pct: numeric('planned_pct', { precision: 10, scale: 4 }),
    bucket: text('bucket'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    index('worker_alloc_by_worker').on(t.tenant_id, t.worker_id),
    index('worker_alloc_by_account').on(t.tenant_id, t.account_id),
    index('worker_alloc_by_project').on(t.tenant_id, t.project_id),
    check(
      'worker_alloc_bucket_check',
      sql`bucket IS NULL OR bucket IN ('billable','internal','bench')`,
    ),
  ],
);

export const accountProjection = peopleSchema.table('account_projection', {
  account_id: uuid('account_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  am_worker_id: uuid('am_worker_id'),
});

export const projectProjection = peopleSchema.table(
  'project_projection',
  {
    project_id: uuid('project_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    account_id: uuid('account_id').notNull(),
    name: text('name').notNull(),
  },
  (t) => [index('project_proj_by_account').on(t.tenant_id, t.account_id)],
);
