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

export const pmSchema = pgSchema('pm');

export const account = pmSchema.table(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    industry: text('industry'),
    am_worker_id: uuid('am_worker_id'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('account_by_tenant').on(t.tenant_id)],
);

export const project = pmSchema.table(
  'project',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    account_id: uuid('account_id').notNull(),
    name: text('name').notNull(),
    objective: text('objective'),
    scope: jsonb('scope'),
    budget_bmm: numeric('budget_bmm'),
    pm_worker_id: uuid('pm_worker_id'),
    phase: text('phase').notNull().default('initiation'),
    status: text('status').notNull().default('active'),
    planner_group_id: uuid('planner_group_id'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('project_by_account_status').on(t.tenant_id, t.account_id, t.status),
    check(
      'project_phase_check',
      sql`phase IN ('initiation','discovery','execution','stabilize','uat','closed')`,
    ),
    check('project_status_check', sql`status IN ('active','on_hold','closed')`),
  ],
);

export const allocation = pmSchema.table(
  'allocation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id').notNull(),
    worker_id: uuid('worker_id'),
    task_id: uuid('task_id'),
    role: text('role'),
    date_from: date('date_from'),
    date_to: date('date_to'),
    bucket: text('bucket').notNull().default('billable'),
    planned_pct: numeric('planned_pct'),
    minutes_per_day: integer('minutes_per_day'),
    weekday_mask: integer('weekday_mask'),
    resource_request_id: uuid('resource_request_id'),
    status: text('status').notNull().default('placeholder'),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('allocation_by_project').on(t.tenant_id, t.project_id),
    index('allocation_open_demand')
      .on(t.tenant_id, t.status)
      .where(sql`worker_id IS NULL AND deleted_at IS NULL`),
    uniqueIndex('allocation_one_placeholder_per_request')
      .on(t.resource_request_id)
      .where(sql`resource_request_id IS NOT NULL AND worker_id IS NULL`),
    check('allocation_bucket_check', sql`bucket IN ('billable','internal','bench')`),
    check('allocation_status_check', sql`status IN ('placeholder','tentative','committed')`),
    check(
      'allocation_worker_rule_check',
      sql`(status = 'placeholder' AND worker_id IS NULL) OR (status IN ('tentative','committed') AND worker_id IS NOT NULL)`,
    ),
  ],
);
