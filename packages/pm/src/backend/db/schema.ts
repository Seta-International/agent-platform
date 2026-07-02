import { textEnum, textEnumCheck } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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

export const pmSchema = pgSchema('pm');

export const PROJECT_PHASES = [
  'initiation',
  'discovery',
  'execution',
  'stabilize',
  'uat',
  'closed',
] as const;

export const PROJECT_STATUS = ['active', 'on_hold', 'closed'] as const;

export const METHODOLOGIES = ['scrum', 'kanban'] as const;

export const PRICING_MODELS = ['fixed_price', 'time_materials'] as const;

export const ALLOCATION_BUCKETS = ['billable', 'internal', 'bench'] as const;

export const ALLOCATION_STATUS = ['placeholder', 'tentative', 'committed'] as const;

export const CHARTER_STATUS = [
  'submitted',
  'pmo_approved',
  'approved',
  'rejected',
  'withdrawn',
] as const;

export const CHARTER_REJECTED_STAGES = ['pmo', 'bod'] as const;

export const PROJECT_ACCESS_LEVELS = ['owner', 'edit', 'view'] as const;

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
    account_id: uuid('account_id')
      .notNull()
      .references(() => account.id),
    name: text('name').notNull(),
    objective: text('objective'),
    scope: jsonb('scope'),
    budget_bmm: numeric('budget_bmm', { precision: 15, scale: 4 }),
    pm_worker_id: uuid('pm_worker_id'),
    // Lazy column-level reference (not table-level foreignKey()): project and charter
    // FK each other (charter.project_id), and charter is declared after project below —
    // a table-level foreignKey() would evaluate `charter` eagerly and hit the TDZ.
    charter_id: uuid('charter_id').references((): AnyPgColumn => charter.id, {
      onDelete: 'set null',
    }),
    pmo_worker_id: uuid('pmo_worker_id'),
    team_size: integer('team_size'),
    methodology: textEnum('methodology', METHODOLOGIES),
    pricing_model: textEnum('pricing_model', PRICING_MODELS),
    date_from: date('date_from'),
    date_to: date('date_to'),
    phase: textEnum('phase', PROJECT_PHASES).notNull().default('initiation'),
    status: textEnum('status', PROJECT_STATUS).notNull().default('active'),
    planner_group_id: uuid('planner_group_id'),
    org_unit_id: uuid('org_unit_id'),
    version: integer('version').default(1).notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('project_by_account_status').on(t.tenant_id, t.account_id, t.status),
    index('project_by_org_unit').on(t.tenant_id, t.org_unit_id),
    index('project_by_charter').on(t.tenant_id, t.charter_id),
    textEnumCheck('project', 'phase', PROJECT_PHASES),
    textEnumCheck('project', 'status', PROJECT_STATUS),
    textEnumCheck('project', 'methodology', METHODOLOGIES),
    textEnumCheck('project', 'pricing_model', PRICING_MODELS),
  ],
);

export const accountRecruiter = pmSchema.table(
  'account_recruiter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    account_id: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    recruiter_worker_id: uuid('recruiter_worker_id').notNull(),
    version: integer('version').default(1).notNull(),
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
    project_id: uuid('project_id')
      .notNull()
      .references(() => project.id),
    worker_id: uuid('worker_id'),
    task_id: uuid('task_id'),
    role: text('role'),
    date_from: date('date_from'),
    date_to: date('date_to'),
    bucket: textEnum('bucket', ALLOCATION_BUCKETS).notNull().default('billable'),
    planned_pct: numeric('planned_pct', { precision: 10, scale: 4 }),
    minutes_per_day: integer('minutes_per_day'),
    weekday_mask: integer('weekday_mask'),
    note: text('note'),
    resource_request_id: uuid('resource_request_id'),
    status: textEnum('status', ALLOCATION_STATUS).notNull().default('placeholder'),
    version: integer('version').default(1).notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('allocation_by_project').on(t.tenant_id, t.project_id),
    index('allocation_by_task').on(t.tenant_id, t.task_id),
    index('allocation_by_worker')
      .on(t.tenant_id, t.worker_id)
      .where(sql`worker_id IS NOT NULL AND deleted_at IS NULL`),
    index('allocation_open_demand')
      .on(t.tenant_id, t.status)
      .where(sql`worker_id IS NULL AND deleted_at IS NULL`),
    uniqueIndex('allocation_one_placeholder_per_request')
      .on(t.tenant_id, t.resource_request_id)
      .where(sql`resource_request_id IS NOT NULL AND worker_id IS NULL`),
    textEnumCheck('allocation', 'bucket', ALLOCATION_BUCKETS),
    textEnumCheck('allocation', 'status', ALLOCATION_STATUS),
    check(
      'allocation_worker_rule_check',
      sql`(status = 'placeholder' AND worker_id IS NULL) OR (status IN ('tentative','committed') AND worker_id IS NOT NULL)`,
    ),
    check('allocation_committed_dates_check', sql`status = 'placeholder' OR date_from IS NOT NULL`),
    check('allocation_weekday_mask_check', sql`weekday_mask BETWEEN 0 AND 127`),
    check('allocation_planned_pct_check', sql`planned_pct >= 0 AND planned_pct <= 100`),
  ],
);

export const charter = pmSchema.table(
  'charter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    account_id: uuid('account_id')
      .notNull()
      .references(() => account.id),
    name: text('name').notNull(),
    pm_worker_id: uuid('pm_worker_id').notNull(),
    submitted_by_user_id: uuid('submitted_by_user_id'),
    decided_by_user_id: uuid('decided_by_user_id'),
    pmo_worker_id: uuid('pmo_worker_id'),
    budget_bmm: numeric('budget_bmm', { precision: 15, scale: 4 }),
    team_size: integer('team_size'),
    methodology: textEnum('methodology', METHODOLOGIES),
    pricing_model: textEnum('pricing_model', PRICING_MODELS),
    date_from: date('date_from'),
    date_to: date('date_to'),
    objective: text('objective'),
    scope: jsonb('scope'),
    status: textEnum('status', CHARTER_STATUS).notNull().default('submitted'),
    rejection_reason: text('rejection_reason'),
    rejected_stage: textEnum('rejected_stage', CHARTER_REJECTED_STAGES),
    pmo_signed_off_by_user_id: uuid('pmo_signed_off_by_user_id'),
    pmo_signed_off_at: timestamp('pmo_signed_off_at', { withTimezone: true }),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    rejected_at: timestamp('rejected_at', { withTimezone: true }),
    project_id: uuid('project_id').references(() => project.id, { onDelete: 'set null' }),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('charter_by_account_status').on(t.tenant_id, t.account_id, t.status),
    index('charter_by_tenant').on(t.tenant_id),
    index('charter_by_project').on(t.tenant_id, t.project_id),
    textEnumCheck('charter', 'status', CHARTER_STATUS),
    textEnumCheck('charter', 'rejected_stage', CHARTER_REJECTED_STAGES),
    textEnumCheck('charter', 'methodology', METHODOLOGIES),
    textEnumCheck('charter', 'pricing_model', PRICING_MODELS),
  ],
);

export const projectAccess = pmSchema.table(
  'project_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    worker_id: uuid('worker_id').notNull(),
    level: textEnum('level', PROJECT_ACCESS_LEVELS).notNull(),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('project_access_uniq').on(t.tenant_id, t.project_id, t.worker_id),
    index('project_access_by_project').on(t.tenant_id, t.project_id),
    textEnumCheck('project_access', 'level', PROJECT_ACCESS_LEVELS),
  ],
);

export const workerProjection = pmSchema.table(
  'worker_projection',
  {
    worker_id: uuid('worker_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    full_name: text('full_name').notNull(),
    job_title: text('job_title'),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('worker_projection_by_name').on(t.tenant_id, t.full_name)],
);

export const staffingPlanLine = pmSchema.table(
  'staffing_plan_line',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    effort_mm: numeric('effort_mm', { precision: 10, scale: 4 }),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('staffing_plan_line_by_project').on(t.tenant_id, t.project_id)],
);

export const staffingPlanLineSkill = pmSchema.table(
  'staffing_plan_line_skill',
  {
    tenant_id: uuid('tenant_id').notNull(),
    line_id: uuid('line_id')
      .notNull()
      .references(() => staffingPlanLine.id, { onDelete: 'cascade' }),
    skill_id: uuid('skill_id').notNull(), // core.skill (no cross-schema FK)
    skill_name: text('skill_name').notNull(), // cross-module cache, refreshed by Task 7
    min_level: integer('min_level'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.line_id, t.skill_id] }),
    index('staffing_plan_line_skill_by_skill').on(t.tenant_id, t.skill_id),
    check('staffing_plan_line_skill_min_level_check', sql`min_level BETWEEN 0 AND 5`),
  ],
);
