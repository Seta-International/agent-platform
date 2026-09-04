import { textEnum, textEnumCheck } from '@seta/shared-db';
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

export const KPI_CATEGORIES = ['quality', 'cost_capacity', 'delivery', 'process'] as const;

export const KPI_METRIC_TIERS = ['core', 'extended'] as const;

export const KPI_RAG_STATUS = ['green', 'yellow', 'red'] as const;

export const KPI_ENTRY_SOURCES = ['manual', 'live'] as const;

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
    // FUT-953: mirrors people's employment_period.lifecycle_stage === 'alumni', kept in sync
    // via people.worker.terminated/reinstated — see subscribers/worker-projection.ts.
    is_alumni: boolean('is_alumni').notNull().default(false),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('person_projection_by_name').on(t.tenant_id, t.full_name)],
);

// Temporal Reporter→Project projection (FUT-610): who owned a project WHEN, so weekly-report
// authorization can be answered as of a past week, not just from the live project_access
// state. Rows are opened/closed by the pm.project.access.changed subscriber; a row with
// valid_to NULL is the assignment currently in force. No FK to project — projection tables
// stay standalone so replays never trip referential order.
export const reporterAssignment = pmSchema.table(
  'reporter_assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id').notNull(),
    person_id: uuid('person_id').notNull(),
    valid_from: timestamp('valid_from', { withTimezone: true }).notNull(),
    valid_to: timestamp('valid_to', { withTimezone: true }),
    /** Event that opened this row — traceability back to the outbox. */
    source_event_id: uuid('source_event_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('reporter_assignment_uniq_open')
      .on(t.tenant_id, t.project_id, t.person_id)
      .where(sql`valid_to IS NULL`),
    index('reporter_assignment_by_project').on(t.tenant_id, t.project_id, t.valid_from),
  ],
);

// Week-start NORM baseline (FUT-593): metric definitions copied BY VALUE the first time a
// (project, week) is touched — every colour computed for that week reads these frozen rows,
// so a mid-week catalog change (published as a version bump) only reaches the next week.
// Applied-set stays live: a metric applied mid-week is appended to the baseline at that
// moment (frozen from then on), so "apply then measure the same week" keeps working.
export const kpiNormBaseline = pmSchema.table(
  'kpi_norm_baseline',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id').notNull(),
    iso_year: integer('iso_year').notNull(),
    iso_week: integer('iso_week').notNull(),
    metric_id: uuid('metric_id').notNull(),
    metric_version: integer('metric_version').notNull(),
    category: textEnum('category', KPI_CATEGORIES).notNull(),
    tier: textEnum('tier', KPI_METRIC_TIERS).notNull(),
    name: text('name').notNull(),
    formula_label: text('formula_label').notNull(),
    component_count: integer('component_count').notNull(),
    component_1_label: text('component_1_label').notNull(),
    component_2_label: text('component_2_label'),
    component_1_integer: boolean('component_1_integer').default(false).notNull(),
    component_2_integer: boolean('component_2_integer').default(false).notNull(),
    component_1_min: numeric('component_1_min', { precision: 15, scale: 4 }),
    component_1_max: numeric('component_1_max', { precision: 15, scale: 4 }),
    is_share: boolean('is_share').default(false).notNull(),
    green_band: jsonb('green_band').notNull(),
    yellow_band: jsonb('yellow_band').notNull(),
    red_band: jsonb('red_band').notNull(),
    insight: text('insight'),
    sort_order: integer('sort_order').default(0).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('kpi_norm_baseline_uniq').on(
      t.tenant_id,
      t.project_id,
      t.iso_year,
      t.iso_week,
      t.metric_id,
    ),
    index('kpi_norm_baseline_by_week').on(t.tenant_id, t.project_id, t.iso_year, t.iso_week),
    textEnumCheck('kpi_norm_baseline', 'category', KPI_CATEGORIES),
    textEnumCheck('kpi_norm_baseline', 'tier', KPI_METRIC_TIERS),
  ],
);

// Per-subscription event-id ledger (FUT-610): projections are updated idempotently keyed on
// event id — a redelivered event hits the primary key and is skipped, so at-least-once
// delivery (and manual replays) can never double-apply a state transition.
export const projectionAppliedEvent = pmSchema.table(
  'projection_applied_event',
  {
    subscription: text('subscription').notNull(),
    event_id: uuid('event_id').notNull(),
    tenant_id: uuid('tenant_id').notNull(),
    /** When the event was applied — doubles as the standard created_at (rows are immutable). */
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.subscription, t.event_id] })],
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

// KPI Metrics (FUT-581): norm library -> per-project configuration -> weekly measurement.
// Health (category/project rollup, worst-wins) and OHS (weighted score) are computed at query
// time from kpi_record_entry, never stored — see docs/feature/kpi-metrics/functional-analysis.md.

export const kpiNorm = pmSchema.table(
  'kpi_norm',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    code: text('code').notNull(),
    revision: text('revision').notNull(),
    effective_date: date('effective_date'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('kpi_norm_uniq_code').on(t.tenant_id, t.code)],
);

export const kpiNormMetric = pmSchema.table(
  'kpi_norm_metric',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    norm_id: uuid('norm_id')
      .notNull()
      .references(() => kpiNorm.id, { onDelete: 'cascade' }),
    category: textEnum('category', KPI_CATEGORIES).notNull(),
    tier: textEnum('tier', KPI_METRIC_TIERS).notNull(),
    name: text('name').notNull(),
    formula_label: text('formula_label').notNull(),
    component_count: integer('component_count').notNull(),
    component_1_label: text('component_1_label').notNull(),
    component_2_label: text('component_2_label'),
    component_1_integer: boolean('component_1_integer').default(false).notNull(),
    component_2_integer: boolean('component_2_integer').default(false).notNull(),
    component_1_min: numeric('component_1_min', { precision: 15, scale: 4 }),
    component_1_max: numeric('component_1_max', { precision: 15, scale: 4 }),
    is_share: boolean('is_share').default(false).notNull(),
    green_band: jsonb('green_band').notNull(),
    yellow_band: jsonb('yellow_band').notNull(),
    red_band: jsonb('red_band').notNull(),
    insight: text('insight'),
    sort_order: integer('sort_order').default(0).notNull(),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('kpi_norm_metric_uniq_name').on(t.tenant_id, t.norm_id, t.name),
    index('kpi_norm_metric_by_norm').on(t.tenant_id, t.norm_id, t.category),
    textEnumCheck('kpi_norm_metric', 'category', KPI_CATEGORIES),
    textEnumCheck('kpi_norm_metric', 'tier', KPI_METRIC_TIERS),
    check('kpi_norm_metric_component_count_check', sql`component_count IN (1, 2)`),
    check(
      'kpi_norm_metric_component_2_label_check',
      sql`component_count = 1 OR component_2_label IS NOT NULL`,
    ),
  ],
);

// Applied set = Configure KPI metrics, PER PROJECT (2026-07-15: reverted back from a tenant-wide
// global set — Configure metrics has a project picker + bulk action, scoped by the same
// project-manage RBAC as Manual KPI input; PMO/BOD see every project, EM/TL only ones they own).
// Row exists = metric is applied for that project; no version/updated_at — toggling is
// insert/delete, never an in-place edit.
export const kpiAppliedMetric = pmSchema.table(
  'kpi_applied_metric',
  {
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    metric_id: uuid('metric_id')
      .notNull()
      .references(() => kpiNormMetric.id),
    applied_by: uuid('applied_by').notNull(), // identity.user (no cross-schema FK)
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.project_id, t.metric_id] }),
    index('kpi_applied_metric_by_metric').on(t.tenant_id, t.metric_id),
  ],
);

export const kpiRecord = pmSchema.table(
  'kpi_record',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    iso_year: integer('iso_year').notNull(),
    iso_week: integer('iso_week').notNull(),
    created_by: uuid('created_by').notNull(), // identity.user (no cross-schema FK)
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('kpi_record_uniq_week').on(t.tenant_id, t.project_id, t.iso_year, t.iso_week),
    index('kpi_record_by_project').on(t.tenant_id, t.project_id),
    check('kpi_record_iso_week_check', sql`iso_week BETWEEN 1 AND 53`),
  ],
);

// Raw formula components are stored individually (not just the computed value) so Edit can
// prefill exactly what was entered before — see functional-analysis.md decision #3.
export const kpiRecordEntry = pmSchema.table(
  'kpi_record_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    record_id: uuid('record_id')
      .notNull()
      .references(() => kpiRecord.id, { onDelete: 'cascade' }),
    metric_id: uuid('metric_id')
      .notNull()
      .references(() => kpiNormMetric.id),
    component_1_value: numeric('component_1_value', { precision: 15, scale: 4 }),
    component_2_value: numeric('component_2_value', { precision: 15, scale: 4 }),
    computed_value: numeric('computed_value', { precision: 15, scale: 4 }),
    status: textEnum('status', KPI_RAG_STATUS),
    source: textEnum('source', KPI_ENTRY_SOURCES).notNull().default('manual'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('kpi_record_entry_uniq_metric').on(t.tenant_id, t.record_id, t.metric_id),
    index('kpi_record_entry_by_record').on(t.tenant_id, t.record_id),
    index('kpi_record_entry_by_metric').on(t.tenant_id, t.metric_id),
    textEnumCheck('kpi_record_entry', 'status', KPI_RAG_STATUS),
    textEnumCheck('kpi_record_entry', 'source', KPI_ENTRY_SOURCES),
  ],
);

// ── Weekly Report & KPI Performance (FUT-609, reconciled with FUT-581's KPI Metrics) ───────
// Ported from PR #387 (feat/FUT-609-weekly-report-kpi-schema) with 3 deliberate departures,
// discussed and agreed with the user:
// 1. No norm_baseline — kpi_norm_metric (FUT-581) is already a versioned catalog with 3-band
//    JSON conditions; a second threshold/direction table would be a second source of truth for
//    the same 44 metrics. norm_snapshot pins directly from kpi_norm_metric instead.
// 2. category columns reuse KPI_CATEGORIES ('cost_capacity'/'process'), not the PR's
//    QCDP_CATEGORIES ('cost'/'performance') — same reasoning: one enum, not two that drift.
// 3. week identity is iso_year+iso_week (matching kpi_record), not week_start date — avoids
//    needing an iso-week<->date conversion utility that doesn't exist anywhere in this repo.
export const REPORT_STATUS = ['draft', 'submitted'] as const;
export const REPORT_COLOURS = ['green', 'yellow', 'red', 'gray'] as const;

export const report = pmSchema.table(
  'report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    iso_year: integer('iso_year').notNull(),
    iso_week: integer('iso_week').notNull(),
    reporter_id: uuid('reporter_id').notNull(), // People worker (no cross-schema FK)
    status: textEnum('status', REPORT_STATUS).notNull().default('draft'),
    /** The reporter's declared QCDP colours as sent from the composer (FUT-601): kept per
     * report so a demote can recompute the shared flags from the REMAINING submitted
     * reports' declarations instead of losing them. */
    declared_colours: jsonb('declared_colours'),
    executive_summary: text('executive_summary'),
    risk_issue: text('risk_issue'), // optional — mockup only shows the block when filled in
    // Road-to-Green action: business rule (functional-analysis.md §9.5) — a non-Green report
    // MUST carry one; enforced as a hard validation in upsertWeeklyReport, not a DB constraint
    // (overall colour is derived at save time, not stored before validation runs).
    road_to_green: text('road_to_green'),
    road_to_green_owner_id: uuid('road_to_green_owner_id'), // People worker (no cross-schema FK)
    road_to_green_due: date('road_to_green_due'),
    overall_colour: textEnum('overall_colour', REPORT_COLOURS), // derived RAG, set later
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('report_identity_uniq').on(
      t.tenant_id,
      t.project_id,
      t.iso_year,
      t.iso_week,
      t.reporter_id,
    ),
    index('report_by_project_week').on(t.tenant_id, t.project_id, t.iso_year, t.iso_week),
    index('report_by_reporter').on(t.tenant_id, t.reporter_id),
    textEnumCheck('report', 'status', REPORT_STATUS),
    textEnumCheck('report', 'overall_colour', REPORT_COLOURS),
    check('report_iso_week_check', sql`iso_week BETWEEN 1 AND 53`),
  ],
);

// Published report versions (append-only): every Submit snapshots the content here. While
// the working row (pm.report) sits in draft, everyone but the author keeps reading the
// latest revision — the "last submitted version" stays visible and effective. A report that
// has comments is frozen (no further edits), so a discussed revision can never change under
// the people who commented on it.
export const reportRevision = pmSchema.table(
  'report_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    report_id: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    executive_summary: text('executive_summary').notNull(),
    risk_issue: text('risk_issue'),
    road_to_green: text('road_to_green'),
    road_to_green_owner_id: uuid('road_to_green_owner_id'),
    road_to_green_due: date('road_to_green_due'),
    overall_colour: textEnum('overall_colour', REPORT_COLOURS),
    declared_colours: jsonb('declared_colours'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('report_revision_by_report').on(t.tenant_id, t.report_id, t.created_at),
    textEnumCheck('report_revision', 'overall_colour', REPORT_COLOURS),
  ],
);

// One row per (report, metric) — narrative snapshot of a metric's value for that report.
// source_entry_id is a soft link: kpi_record_entry rows are deleted+recreated wholesale on every
// Manual KPI Input save (see upsertKpiRecord), so it must not block that delete — ON DELETE SET
// NULL, never CASCADE/NO ACTION.
export const metricValue = pmSchema.table(
  'metric_value',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    report_id: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    metric_id: uuid('metric_id')
      .notNull()
      .references(() => kpiNormMetric.id),
    source_entry_id: uuid('source_entry_id').references(() => kpiRecordEntry.id, {
      onDelete: 'set null',
    }),
    computed_value: numeric('computed_value', { precision: 18, scale: 6 }),
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

// One row per (project, week, category) — a shared status, not per-report/reporter: `report`
// allows several reporters for the same (project, week), so tying the flag to a single report_id
// would leave "whose override wins" undefined. report_id is kept as an optional "last touched
// by" pointer only.
export const flag = pmSchema.table(
  'flag',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    iso_year: integer('iso_year').notNull(),
    iso_week: integer('iso_week').notNull(),
    report_id: uuid('report_id').references(() => report.id, { onDelete: 'set null' }),
    category: textEnum('category', KPI_CATEGORIES).notNull(),
    computed_colour: textEnum('computed_colour', REPORT_COLOURS),
    final_colour: textEnum('final_colour', REPORT_COLOURS),
    latest_audit_entry_id: uuid('latest_audit_entry_id'), // FK added in platform migration
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('flag_project_week_category_uniq').on(
      t.tenant_id,
      t.project_id,
      t.iso_year,
      t.iso_week,
      t.category,
    ),
    index('flag_by_report').on(t.tenant_id, t.report_id),
    textEnumCheck('flag', 'category', KPI_CATEGORIES),
    textEnumCheck('flag', 'computed_colour', REPORT_COLOURS),
    textEnumCheck('flag', 'final_colour', REPORT_COLOURS),
    check('flag_iso_week_check', sql`iso_week BETWEEN 1 AND 53`),
  ],
);

// Append-only audit trail for flag colour overrides (append-only guard added in the
// hand-written platform migration, since drizzle-kit cannot model triggers).
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

// Frozen copy of a kpi_norm_metric's category + bands at the moment a report references it —
// keeps the report's colours reproducible even if the norm's bands are edited later. No
// norm_baseline: kpi_norm_metric is the only catalog (see file-header note above).
export const normSnapshot = pmSchema.table(
  'norm_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    report_id: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    metric_id: uuid('metric_id')
      .notNull()
      .references(() => kpiNormMetric.id),
    metric_version: integer('metric_version').notNull(), // snapshot of kpi_norm_metric.version
    category: textEnum('category', KPI_CATEGORIES).notNull(),
    green_band: jsonb('green_band').notNull(),
    yellow_band: jsonb('yellow_band').notNull(),
    red_band: jsonb('red_band').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('norm_snapshot_report_metric_uniq').on(t.tenant_id, t.report_id, t.metric_id),
    textEnumCheck('norm_snapshot', 'category', KPI_CATEGORIES),
  ],
);

// Precomputed per (project, week) rollup — column names mirror KPI_CATEGORIES so they line up
// with kpi_norm_metric.category (cost_capacity/process, not the PR's cost/performance).
export const projectWeekRollup = pmSchema.table(
  'project_week_rollup',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    iso_year: integer('iso_year').notNull(),
    iso_week: integer('iso_week').notNull(),
    quality_colour: textEnum('quality_colour', REPORT_COLOURS),
    cost_capacity_colour: textEnum('cost_capacity_colour', REPORT_COLOURS),
    delivery_colour: textEnum('delivery_colour', REPORT_COLOURS),
    process_colour: textEnum('process_colour', REPORT_COLOURS),
    rag: textEnum('rag', REPORT_COLOURS), // worst-of-four
    ohs: numeric('ohs', { precision: 5, scale: 2 }), // operational health score
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('project_week_rollup_uniq').on(t.tenant_id, t.project_id, t.iso_year, t.iso_week),
    textEnumCheck('project_week_rollup', 'quality_colour', REPORT_COLOURS),
    textEnumCheck('project_week_rollup', 'cost_capacity_colour', REPORT_COLOURS),
    textEnumCheck('project_week_rollup', 'delivery_colour', REPORT_COLOURS),
    textEnumCheck('project_week_rollup', 'process_colour', REPORT_COLOURS),
    textEnumCheck('project_week_rollup', 'rag', REPORT_COLOURS),
    check('project_week_rollup_iso_week_check', sql`iso_week BETWEEN 1 AND 53`),
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
    // Display name snapshotted at write time — pm can't join identity.user (no cross-schema
    // reads) and person_projection is keyed by person_id, not user_id.
    author_name: text('author_name').notNull(),
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
