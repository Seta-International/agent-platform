import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
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
    full_name: text('full_name').notNull(),
    work_email: text('work_email'),
    dob: date('dob'),
    gender: text('gender'),
    phone: text('phone'),
    emergency_contact: jsonb('emergency_contact'),
    profile_completed_at: timestamp('profile_completed_at', { withTimezone: true }),
    portal_access: boolean('portal_access').notNull().default(false),
    job_title: text('job_title'),
    manager_id: uuid('manager_id'),
    version: integer('version').default(1).notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('worker_uniq_person').on(t.person_id),
    uniqueIndex('worker_uniq_email_per_tenant')
      .on(t.tenant_id, t.work_email)
      .where(sql`work_email IS NOT NULL AND deleted_at IS NULL`),
    index('worker_by_tenant_live').on(t.tenant_id, t.deleted_at),
    index('worker_by_manager').on(t.tenant_id, t.manager_id),
    foreignKey({
      columns: [t.manager_id],
      foreignColumns: [t.person_id],
      name: 'worker_manager_fk',
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
