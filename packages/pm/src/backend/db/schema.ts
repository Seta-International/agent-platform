import { textEnum, textEnumCheck } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
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

export const PROJECT_STATUS = [
  'submitted',
  'pmo_approved',
  'active',
  'on_hold',
  'closed',
  'rejected',
  'withdrawn',
] as const;

/** Statuses a "real project" reader (boards, pickers, allocations) may see — excludes
 * the pre-approval charter statuses (submitted/pmo_approved/rejected/withdrawn). */
export const LIVE_PROJECT_STATUSES = ['active', 'on_hold', 'closed'] as const;

export const METHODOLOGIES = ['scrum', 'kanban'] as const;

export const PRICING_MODELS = ['fixed_price', 'time_materials'] as const;

export const ALLOCATION_BUCKETS = ['billable', 'internal', 'bench'] as const;

export const ALLOCATION_STATUS = ['placeholder', 'tentative', 'committed'] as const;

export const CHARTER_REJECTED_STAGES = ['pmo', 'bod'] as const;

export const PROJECT_ACCESS_LEVELS = ['owner', 'edit', 'view'] as const;

export const account = pmSchema.table(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    industry: text('industry'),
    am_person_id: uuid('am_person_id'),
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
    pm_person_id: uuid('pm_person_id'),
    pmo_person_id: uuid('pmo_person_id'),
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
    textEnumCheck('project', 'phase', PROJECT_PHASES),
    textEnumCheck('project', 'status', PROJECT_STATUS),
    textEnumCheck('project', 'methodology', METHODOLOGIES),
    textEnumCheck('project', 'pricing_model', PRICING_MODELS),
  ],
);

export const projectApproval = pmSchema.table(
  'project_approval',
  {
    project_id: uuid('project_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    submitted_by_user_id: uuid('submitted_by_user_id'),
    pmo_signed_off_at: timestamp('pmo_signed_off_at', { withTimezone: true }),
    pmo_signed_off_by_user_id: uuid('pmo_signed_off_by_user_id'),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    decided_by_user_id: uuid('decided_by_user_id'),
    rejected_at: timestamp('rejected_at', { withTimezone: true }),
    rejected_stage: textEnum('rejected_stage', CHARTER_REJECTED_STAGES),
    rejection_reason: text('rejection_reason'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.project_id],
      foreignColumns: [project.id],
      name: 'project_approval_project_fk',
    }).onDelete('cascade'),
    textEnumCheck('project_approval', 'rejected_stage', CHARTER_REJECTED_STAGES),
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
    recruiter_person_id: uuid('recruiter_person_id').notNull(),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('account_recruiter_uniq').on(t.tenant_id, t.account_id, t.recruiter_person_id),
    index('account_recruiter_by_account').on(t.tenant_id, t.account_id),
    index('account_recruiter_by_recruiter').on(t.tenant_id, t.recruiter_person_id),
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
    person_id: uuid('person_id'),
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
      .on(t.tenant_id, t.person_id)
      .where(sql`person_id IS NOT NULL AND deleted_at IS NULL`),
    index('allocation_open_demand')
      .on(t.tenant_id, t.status)
      .where(sql`person_id IS NULL AND deleted_at IS NULL`),
    uniqueIndex('allocation_one_placeholder_per_request')
      .on(t.tenant_id, t.resource_request_id)
      .where(sql`resource_request_id IS NOT NULL AND person_id IS NULL`),
    textEnumCheck('allocation', 'bucket', ALLOCATION_BUCKETS),
    textEnumCheck('allocation', 'status', ALLOCATION_STATUS),
    check(
      'allocation_worker_rule_check',
      sql`(status = 'placeholder' AND person_id IS NULL) OR (status IN ('tentative','committed') AND person_id IS NOT NULL)`,
    ),
    check('allocation_committed_dates_check', sql`status = 'placeholder' OR date_from IS NOT NULL`),
    check('allocation_weekday_mask_check', sql`weekday_mask BETWEEN 0 AND 127`),
    check('allocation_planned_pct_check', sql`planned_pct >= 0 AND planned_pct <= 100`),
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
    person_id: uuid('person_id').notNull(),
    level: textEnum('level', PROJECT_ACCESS_LEVELS).notNull(),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('project_access_uniq').on(t.tenant_id, t.project_id, t.person_id),
    index('project_access_by_project').on(t.tenant_id, t.project_id),
    textEnumCheck('project_access', 'level', PROJECT_ACCESS_LEVELS),
  ],
);

export const personProjection = pmSchema.table(
  'person_projection',
  {
    person_id: uuid('person_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    full_name: text('full_name').notNull(),
    job_title: text('job_title'),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('person_projection_by_name').on(t.tenant_id, t.full_name)],
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

// ── Weekly Report & KPI Performance (FUT-609) ──────────────────────────────

export const REPORT_COLOURS = ['green', 'yellow', 'red', 'gray'] as const;
export const QCDP_CATEGORIES = ['quality', 'cost', 'delivery', 'performance'] as const;
export const METRIC_DIRECTIONS = ['higher_better', 'lower_better'] as const;
export const REPORT_STATUS = ['draft', 'submitted'] as const;

export const report = pmSchema.table(
  'report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => project.id),
    week_start: date('week_start').notNull(), // Monday, Asia/Ho_Chi_Minh
    reporter_id: uuid('reporter_id').notNull(), // People worker (no cross-schema FK)
    status: textEnum('status', REPORT_STATUS).notNull().default('draft'),
    executive_summary: text('executive_summary'),
    overall_colour: textEnum('overall_colour', REPORT_COLOURS), // derived RAG, set later
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('report_identity_uniq').on(t.tenant_id, t.project_id, t.week_start, t.reporter_id),
    index('report_by_project_week').on(t.tenant_id, t.project_id, t.week_start),
    index('report_by_reporter').on(t.tenant_id, t.reporter_id),
    textEnumCheck('report', 'status', REPORT_STATUS),
    textEnumCheck('report', 'overall_colour', REPORT_COLOURS),
  ],
);

export const metricValue = pmSchema.table(
  'metric_value',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    report_id: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    metric_id: uuid('metric_id').notNull(), // Admin catalog metric (no cross-schema FK)
    raw_value: numeric('raw_value', { precision: 18, scale: 6 }),
    colour: textEnum('colour', REPORT_COLOURS), // derived, set by colour computation
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('metric_value_identity_uniq').on(t.tenant_id, t.report_id, t.metric_id),
    index('metric_value_by_report').on(t.tenant_id, t.report_id),
    textEnumCheck('metric_value', 'colour', REPORT_COLOURS),
  ],
);

export const flag = pmSchema.table(
  'flag',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    report_id: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    category: textEnum('category', QCDP_CATEGORIES).notNull(),
    computed_colour: textEnum('computed_colour', REPORT_COLOURS).notNull(),
    final_colour: textEnum('final_colour', REPORT_COLOURS).notNull(),
    latest_audit_entry_id: uuid('latest_audit_entry_id'), // FK added in platform migration
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('flag_report_category_uniq').on(t.tenant_id, t.report_id, t.category),
    textEnumCheck('flag', 'category', QCDP_CATEGORIES),
    textEnumCheck('flag', 'computed_colour', REPORT_COLOURS),
    textEnumCheck('flag', 'final_colour', REPORT_COLOURS),
  ],
);

export const flagAuditEntry = pmSchema.table(
  'flag_audit_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    flag_id: uuid('flag_id')
      .notNull()
      .references(() => flag.id, { onDelete: 'cascade' }),
    from_colour: textEnum('from_colour', REPORT_COLOURS), // null for the initial entry
    to_colour: textEnum('to_colour', REPORT_COLOURS).notNull(),
    reason: text('reason'),
    actor_user_id: uuid('actor_user_id'), // null = system-computed
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('flag_audit_entry_by_flag').on(t.tenant_id, t.flag_id, t.created_at),
    textEnumCheck('flag_audit_entry', 'from_colour', REPORT_COLOURS),
    textEnumCheck('flag_audit_entry', 'to_colour', REPORT_COLOURS),
  ],
);

export const normBaseline = pmSchema.table(
  'norm_baseline',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    metric_id: uuid('metric_id').notNull(), // Admin catalog metric
    catalog_version: integer('catalog_version').notNull(),
    category: textEnum('category', QCDP_CATEGORIES).notNull(),
    direction: textEnum('direction', METRIC_DIRECTIONS).notNull(),
    goal_threshold: numeric('goal_threshold', { precision: 18, scale: 6 }),
    yellow_threshold: numeric('yellow_threshold', { precision: 18, scale: 6 }),
    formula_ref: text('formula_ref'),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('norm_baseline_version_uniq').on(t.tenant_id, t.metric_id, t.catalog_version),
    textEnumCheck('norm_baseline', 'category', QCDP_CATEGORIES),
    textEnumCheck('norm_baseline', 'direction', METRIC_DIRECTIONS),
  ],
);

export const normSnapshot = pmSchema.table(
  'norm_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    report_id: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    metric_id: uuid('metric_id').notNull(),
    catalog_version: integer('catalog_version').notNull(),
    category: textEnum('category', QCDP_CATEGORIES).notNull(),
    direction: textEnum('direction', METRIC_DIRECTIONS).notNull(),
    goal_threshold: numeric('goal_threshold', { precision: 18, scale: 6 }),
    yellow_threshold: numeric('yellow_threshold', { precision: 18, scale: 6 }),
    formula_ref: text('formula_ref'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('norm_snapshot_report_metric_uniq').on(t.tenant_id, t.report_id, t.metric_id),
    textEnumCheck('norm_snapshot', 'category', QCDP_CATEGORIES),
    textEnumCheck('norm_snapshot', 'direction', METRIC_DIRECTIONS),
  ],
);

export const projectWeekRollup = pmSchema.table(
  'project_week_rollup',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => project.id),
    week_start: date('week_start').notNull(),
    quality_colour: textEnum('quality_colour', REPORT_COLOURS),
    cost_colour: textEnum('cost_colour', REPORT_COLOURS),
    delivery_colour: textEnum('delivery_colour', REPORT_COLOURS),
    performance_colour: textEnum('performance_colour', REPORT_COLOURS),
    rag: textEnum('rag', REPORT_COLOURS), // worst-of-four
    ohs: numeric('ohs', { precision: 5, scale: 2 }), // operational health score
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('project_week_rollup_uniq').on(t.tenant_id, t.project_id, t.week_start),
    textEnumCheck('project_week_rollup', 'quality_colour', REPORT_COLOURS),
    textEnumCheck('project_week_rollup', 'cost_colour', REPORT_COLOURS),
    textEnumCheck('project_week_rollup', 'delivery_colour', REPORT_COLOURS),
    textEnumCheck('project_week_rollup', 'performance_colour', REPORT_COLOURS),
    textEnumCheck('project_week_rollup', 'rag', REPORT_COLOURS),
  ],
);

export const comment = pmSchema.table(
  'comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    report_id: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    parent_comment_id: uuid('parent_comment_id'), // self-FK added below
    author_user_id: uuid('author_user_id').notNull(),
    body: text('body').notNull(),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('comment_by_report').on(t.tenant_id, t.report_id, t.created_at),
    foreignKey({
      columns: [t.parent_comment_id],
      foreignColumns: [t.id],
      name: 'comment_parent_fk',
    }).onDelete('cascade'),
  ],
);
