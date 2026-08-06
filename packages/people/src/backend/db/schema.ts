import { textEnum, textEnumCheck, textEnumValuesSql } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const peopleSchema = pgSchema('people');

export const LIFECYCLE_STAGES = [
  'preboarding',
  'onboarding',
  'probation',
  'active',
  'on_leave',
  'offboarding',
  'alumni',
  'did_not_start',
] as const;

export const AVAILABILITY_STATUS = ['available', 'busy', 'ooo'] as const;

export const ORG_UNIT_KINDS = ['executive', 'operation', 'function', 'delivery', 'pmo'] as const;

export const GENDERS = ['male', 'female', 'prefer_not_to_say'] as const;

export const PROJECTION_BUCKETS = ['billable', 'internal', 'bench'] as const;

export const person = peopleSchema.table(
  'person',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    bio: text('bio'),
    original_hire_date: date('original_hire_date'),
    seniority_date: date('seniority_date'),
    employee_no: text('employee_no'),
    full_name: text('full_name'),
    work_email: text('work_email'),
    personal_email: text('personal_email'),
    dob: date('dob'),
    gender: textEnum('gender', GENDERS),
    phone: text('phone'),
    emergency_contact: jsonb('emergency_contact'),
    profile_completed_at: timestamp('profile_completed_at', { withTimezone: true }),
    cv_storage_key: text('cv_storage_key'),
    // M365 directory sync (FUT-842). photo_storage_key mirrors cv_storage_key: an S3 key
    // via @seta/shared-storage, not a URL. directory_managed drives the field lock in
    // editWorker — people cannot read the integrations link table across the schema boundary.
    photo_storage_key: text('photo_storage_key'),
    directory_managed: boolean('directory_managed').default(false).notNull(),
    // Lazy column-level reference (not table-level foreignKey()): org_unit is
    // declared after person below, so a table-level foreignKey() would evaluate
    // `orgUnit` eagerly and hit the TDZ.
    org_unit_id: uuid('org_unit_id').references((): AnyPgColumn => orgUnit.id),
    availability_status: textEnum('availability_status', AVAILABILITY_STATUS)
      .default('available')
      .notNull(),
    ooo_until: timestamp('ooo_until', { withTimezone: true }),
    work_start: time('work_start'),
    work_end: time('work_end'),
    timezone: text('timezone').default('UTC').notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('person_uniq_employee_no_per_tenant')
      .on(t.tenant_id, t.employee_no)
      .where(sql`employee_no IS NOT NULL AND deleted_at IS NULL`),
    uniqueIndex('person_uniq_email_per_tenant')
      .on(t.tenant_id, t.work_email)
      .where(sql`work_email IS NOT NULL AND deleted_at IS NULL`),
    index('person_by_tenant_live').on(t.tenant_id).where(sql`deleted_at IS NULL`),
    index('person_by_org_unit').on(t.tenant_id, t.org_unit_id),
    textEnumCheck('person', 'gender', GENDERS),
    textEnumCheck('person', 'availability_status', AVAILABILITY_STATUS),
  ],
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
    lifecycle_stage: textEnum('lifecycle_stage', LIFECYCLE_STAGES).notNull().default('preboarding'),
    employment_type: text('employment_type'),
    job_title: text('job_title'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('employment_period_uniq_seq').on(t.tenant_id, t.person_id, t.seq),
    uniqueIndex('employment_period_one_open').on(t.person_id).where(sql`end_date IS NULL`),
    index('employment_period_by_person').on(t.tenant_id, t.person_id),
    foreignKey({
      columns: [t.person_id],
      foreignColumns: [person.id],
      name: 'employment_period_person_fk',
    }),
    textEnumCheck('employment_period', 'lifecycle_stage', LIFECYCLE_STAGES),
  ],
);

export const orgUnit = peopleSchema.table(
  'org_unit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    parent_id: uuid('parent_id'),
    name: text('name').notNull(),
    kind: textEnum('kind', ORG_UNIT_KINDS).notNull(),
    // Keyed on person_id (the domain's canonical worker handle, as returned by
    // createWorker/insertWorkerAggregate), not worker.id.
    head_worker_id: uuid('head_worker_id'),
    sort: integer('sort').notNull().default(0),
    version: integer('version').default(1).notNull(),
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
    foreignKey({
      columns: [t.head_worker_id],
      foreignColumns: [person.id],
      name: 'org_unit_head_worker_fk',
    }).onDelete('set null'),
    textEnumCheck('org_unit', 'kind', ORG_UNIT_KINDS),
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
    version: integer('version').default(1).notNull(),
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
    check('person_skill_level_check', sql`level BETWEEN 0 AND 5`),
  ],
);

export const personHistory = peopleSchema.table(
  'person_history',
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
  (t) => [
    index('person_history_by_person').on(t.tenant_id, t.person_id, t.at),
    foreignKey({
      columns: [t.person_id],
      foreignColumns: [person.id],
      name: 'person_history_person_fk',
    }).onDelete('cascade'),
  ],
);

export const workerAllocationProjection = peopleSchema.table(
  'worker_allocation_projection',
  {
    allocation_id: uuid('allocation_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id'),
    project_id: uuid('project_id').notNull(),
    account_id: uuid('account_id').notNull(),
    lead_person_id: uuid('lead_person_id'),
    date_from: date('date_from'),
    date_to: date('date_to'),
    planned_pct: numeric('planned_pct', { precision: 10, scale: 4 }),
    bucket: text('bucket'),
    active: boolean('active').notNull().default(true),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('worker_alloc_by_person').on(t.tenant_id, t.person_id),
    index('worker_alloc_by_account').on(t.tenant_id, t.account_id),
    index('worker_alloc_by_project').on(t.tenant_id, t.project_id),
    check(
      'worker_alloc_bucket_check',
      sql.raw(`bucket IS NULL OR bucket IN (${textEnumValuesSql(PROJECTION_BUCKETS)})`),
    ),
  ],
);

export const accountProjection = peopleSchema.table('account_projection', {
  account_id: uuid('account_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projectProjection = peopleSchema.table(
  'project_projection',
  {
    project_id: uuid('project_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    account_id: uuid('account_id').notNull(),
    name: text('name').notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('project_proj_by_account').on(t.tenant_id, t.account_id)],
);

export const userProjection = peopleSchema.table(
  'user_projection',
  {
    user_id: uuid('user_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id').notNull(),
    deactivated_at: timestamp('deactivated_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('user_projection_uniq_person').on(t.tenant_id, t.person_id)],
);
