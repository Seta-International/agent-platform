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
    version: integer('version').default(1).notNull(),
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
    budget_bmm: numeric('budget_bmm', { precision: 15, scale: 4 }),
    pm_worker_id: uuid('pm_worker_id'),
    charter_id: uuid('charter_id'),
    pmo_worker_id: uuid('pmo_worker_id'),
    team_size: integer('team_size'),
    methodology: text('methodology'),
    pricing_model: text('pricing_model'),
    date_from: date('date_from'),
    date_to: date('date_to'),
    phase: text('phase').notNull().default('initiation'),
    status: text('status').notNull().default('active'),
    planner_group_id: uuid('planner_group_id'),
    version: integer('version').default(1).notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
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
    check(
      'project_methodology_check',
      sql`methodology IS NULL OR methodology IN ('scrum','kanban')`,
    ),
    check(
      'project_pricing_check',
      sql`pricing_model IS NULL OR pricing_model IN ('fixed_price','time_materials')`,
    ),
  ],
);

export const accountRecruiter = pmSchema.table(
  'account_recruiter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    account_id: uuid('account_id').notNull(),
    recruiter_worker_id: uuid('recruiter_worker_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('account_recruiter_uniq').on(t.tenant_id, t.account_id, t.recruiter_worker_id),
    index('account_recruiter_by_account').on(t.tenant_id, t.account_id),
    index('account_recruiter_by_recruiter').on(t.tenant_id, t.recruiter_worker_id),
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
    planned_pct: numeric('planned_pct', { precision: 10, scale: 4 }),
    minutes_per_day: integer('minutes_per_day'),
    weekday_mask: integer('weekday_mask'),
    note: text('note'),
    resource_request_id: uuid('resource_request_id'),
    status: text('status').notNull().default('placeholder'),
    version: integer('version').default(1).notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('allocation_by_project').on(t.tenant_id, t.project_id),
    index('allocation_by_worker')
      .on(t.tenant_id, t.worker_id)
      .where(sql`worker_id IS NOT NULL AND deleted_at IS NULL`),
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
    check('allocation_committed_dates_check', sql`status = 'placeholder' OR date_from IS NOT NULL`),
  ],
);

export const charter = pmSchema.table(
  'charter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    account_id: uuid('account_id').notNull(),
    name: text('name').notNull(),
    pm_worker_id: uuid('pm_worker_id').notNull(),
    submitted_by_user_id: uuid('submitted_by_user_id'),
    decided_by_user_id: uuid('decided_by_user_id'),
    pmo_worker_id: uuid('pmo_worker_id'),
    budget_bmm: numeric('budget_bmm', { precision: 15, scale: 4 }),
    team_size: integer('team_size'),
    methodology: text('methodology'),
    pricing_model: text('pricing_model'),
    date_from: date('date_from'),
    date_to: date('date_to'),
    objective: text('objective'),
    scope: jsonb('scope'),
    status: text('status').notNull().default('submitted'),
    rejection_reason: text('rejection_reason'),
    rejected_stage: text('rejected_stage'),
    pmo_signed_off_by_user_id: uuid('pmo_signed_off_by_user_id'),
    pmo_signed_off_at: timestamp('pmo_signed_off_at', { withTimezone: true }),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    rejected_at: timestamp('rejected_at', { withTimezone: true }),
    project_id: uuid('project_id'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('charter_by_account_status').on(t.tenant_id, t.account_id, t.status),
    index('charter_by_tenant').on(t.tenant_id),
    check(
      'charter_status_check',
      sql`status IN ('submitted','pmo_approved','approved','rejected','withdrawn')`,
    ),
    check(
      'charter_rejected_stage_check',
      sql`rejected_stage IS NULL OR rejected_stage IN ('pmo','bod')`,
    ),
    check(
      'charter_methodology_check',
      sql`methodology IS NULL OR methodology IN ('scrum','kanban')`,
    ),
    check(
      'charter_pricing_check',
      sql`pricing_model IS NULL OR pricing_model IN ('fixed_price','time_materials')`,
    ),
  ],
);

export const projectAccess = pmSchema.table(
  'project_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id').notNull(),
    worker_id: uuid('worker_id').notNull(),
    level: text('level').notNull(),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('project_access_uniq').on(t.tenant_id, t.project_id, t.worker_id),
    index('project_access_by_project').on(t.tenant_id, t.project_id),
    check('project_access_level_check', sql`level IN ('owner','edit','view')`),
  ],
);

export const staffingPlanLine = pmSchema.table(
  'staffing_plan_line',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id').notNull(),
    role: text('role').notNull(),
    effort_mm: numeric('effort_mm', { precision: 10, scale: 4 }),
    skills: jsonb('skills'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('staffing_plan_line_by_project').on(t.tenant_id, t.project_id)],
);
