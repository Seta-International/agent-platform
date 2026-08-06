import { z } from 'zod';

// Read-only KPI Norm reference sections (Methodology lens, Executive EQI/TDI) — documentation
// content the web Norm tab renders; see kpi-norm-reference.ts for why it is not norm config.
export {
  KPI_EXECUTIVE_MATRIX_WARNING,
  KPI_EXECUTIVE_METRICS,
  KPI_METHODOLOGY_LENS,
  type KpiMethodologyLensGroup,
  type KpiReferenceMetric,
} from './kpi-norm-reference.ts';

export const createAccountInput = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  am_worker_id: z.string().uuid().optional(),
  recruiter_worker_ids: z.array(z.string().uuid()).optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountInput>;

export const setAccountRecruitersInput = z.object({
  account_id: z.string().uuid(),
  recruiter_worker_ids: z.array(z.string().uuid()),
});
export type SetAccountRecruitersInput = z.infer<typeof setAccountRecruitersInput>;

export const editAccountPatch = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().nullable().optional(),
  am_worker_id: z.string().uuid().nullable().optional(),
});
export const editAccountInput = z.object({
  account_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  patch: editAccountPatch,
});
export type EditAccountInput = z.infer<typeof editAccountInput>;

export const methodologyEnum = z.enum(['scrum', 'kanban']);
export const pricingEnum = z.enum(['fixed_price', 'time_materials']);
export const phaseEnum = z.enum([
  'initiation',
  'discovery',
  'execution',
  'stabilize',
  'uat',
  'closed',
]);
export const projectStatusEnum = z.enum(['active', 'on_hold', 'closed']);
export const accessLevelEnum = z.enum(['owner', 'edit', 'view']);
export const charterScope = z.object({ in: z.string().default(''), out: z.string().default('') });

export const submitCharterInput = z.object({
  account_id: z.string().uuid(),
  name: z.string().min(1),
  pm_worker_id: z.string().uuid(),
  pmo_worker_id: z.string().uuid().optional(),
  budget_bmm: z.number().nonnegative().optional(),
  team_size: z.number().int().nonnegative().optional(),
  methodology: methodologyEnum.optional(),
  pricing_model: pricingEnum.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  objective: z.string().optional(),
  scope: charterScope.optional(),
});
export type SubmitCharterInput = z.infer<typeof submitCharterInput>;

export const editCharterPatch = submitCharterInput.partial().omit({ account_id: true });
export const editCharterInput = z.object({
  charter_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  patch: editCharterPatch,
});
export type EditCharterInput = z.infer<typeof editCharterInput>;

export const rejectCharterInput = z.object({
  charter_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  reason: z.string().min(1),
});
export type RejectCharterInput = z.infer<typeof rejectCharterInput>;

export const charterStatusEnum = z.enum([
  'submitted',
  'pmo_approved',
  'approved',
  'rejected',
  'withdrawn',
]);

const emptyToUndefined = (v: unknown) => (v === '' || v == null ? undefined : v);

export const charterListQuery = z.object({
  status: z.preprocess(emptyToUndefined, charterStatusEnum.optional()),
  account_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  sort: z.enum(['submitted', 'name', 'budget', 'team']).default('submitted'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CharterListQuery = z.infer<typeof charterListQuery>;
export type CharterListQueryInput = z.input<typeof charterListQuery>;

export const editProjectPatch = z.object({
  objective: z.string().nullable().optional(),
  scope: charterScope.nullable().optional(),
  phase: phaseEnum.optional(),
  status: projectStatusEnum.optional(),
  planner_group_id: z.string().uuid().nullable().optional(),
  org_unit_id: z.string().uuid().nullable().optional(),
});
export const editProjectInput = z.object({
  project_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  patch: editProjectPatch,
});
export type EditProjectInput = z.infer<typeof editProjectInput>;

export const setProjectAccessInput = z.object({
  project_id: z.string().uuid(),
  grants: z.array(z.object({ worker_id: z.string().uuid(), level: accessLevelEnum })),
});
export type SetProjectAccessInput = z.infer<typeof setProjectAccessInput>;

export const staffingPlanLineSkillInput = z.object({
  skill_id: z.string().uuid(),
  skill_name: z.string().min(1),
  min_level: z.number().int().min(0).max(5).optional(),
});
export type StaffingPlanLineSkillInput = z.infer<typeof staffingPlanLineSkillInput>;

export const staffingPlanLineInput = z.object({
  project_id: z.string().uuid(),
  line_id: z.string().uuid().optional(),
  expected_version: z.number().int().positive().optional(),
  role: z.string().min(1),
  effort_mm: z.number().nonnegative().optional(),
  skills: z.array(staffingPlanLineSkillInput).optional(),
});
export type StaffingPlanLineInput = z.infer<typeof staffingPlanLineInput>;

export const createAllocationInput = z.object({
  project_id: z.string().uuid(),
  worker_id: z.string().uuid().nullable().optional(),
  role: z.string().min(1).nullable().optional(),
  date_from: z.string().nullable().optional(),
  date_to: z.string().nullable().optional(),
  bucket: z.enum(['billable', 'internal', 'bench']).optional().default('billable'),
  planned_pct: z.number().min(0).max(100).nullable().optional(),
  minutes_per_day: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(['placeholder', 'tentative', 'committed']).optional().default('placeholder'),
  note: z.string().nullable().optional(),
});
export type CreateAllocationInput = z.input<typeof createAllocationInput>;

export const updateAllocationInput = z.object({
  expected_version: z.number().int().positive().optional(),
  project_id: z.string().uuid().optional(),
  role: z.string().min(1).nullable().optional(),
  planned_pct: z.number().min(0).max(100).nullable().optional(),
  status: z.enum(['placeholder', 'tentative', 'committed']).optional(),
  date_from: z.string().nullable().optional(),
  date_to: z.string().nullable().optional(),
  bucket: z.enum(['billable', 'internal', 'bench']).optional(),
  note: z.string().nullable().optional(),
});
export type UpdateAllocationInput = z.infer<typeof updateAllocationInput>;

export const checkAllocationEffortQuery = z.object({
  worker_id: z.string().uuid(),
  date_from: z.string(),
  date_to: z.string(),
  planned_pct: z.coerce.number().min(0).max(100),
  exclude_allocation_id: z.string().uuid().optional(),
});
export type CheckAllocationEffortQuery = z.infer<typeof checkAllocationEffortQuery>;

export const splitAllocationInput = z.object({
  new_end_date: z.string(),
  continuation: z.object({
    planned_pct: z.number().min(0).max(100).nullable().optional(),
    bucket: z.enum(['billable', 'internal', 'bench']).optional(),
    date_to: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  }),
  expected_version: z.number().int().positive().optional(),
});
export type SplitAllocationInput = z.infer<typeof splitAllocationInput>;

export const reassignAllocationInput = z.object({
  source: z.object({
    date_to: z.string(),
  }),
  targets: z
    .array(
      z.object({
        project_id: z.string().uuid(),
        date_from: z.string(),
        planned_pct: z.number().min(0).max(100),
        bucket: z.enum(['billable', 'internal', 'bench']).optional().default('billable'),
        date_to: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .min(1),
  expected_version: z.number().int().positive().optional(),
});
export type ReassignAllocationInput = z.infer<typeof reassignAllocationInput>;

/** Configure metrics is per-project with a bulk project picker (functional-analysis.md §2d):
 * toggling a metric applies/removes it across every id in `project_ids` at once. */
export const setAppliedMetricInput = z.object({
  applied: z.boolean(),
  project_ids: z.array(z.string().uuid()).min(1),
});
export type SetAppliedMetricInput = z.infer<typeof setAppliedMetricInput>;

const commaSeparatedUuids = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.array(z.string().uuid()))
    .optional(),
);
export const kpiAppliedMetricsQuery = z.object({
  project_ids: commaSeparatedUuids,
  iso_year: z.coerce.number().int().optional(),
  iso_week: z.coerce.number().int().min(1).max(53).optional(),
});
export type KpiAppliedMetricsQuery = z.infer<typeof kpiAppliedMetricsQuery>;

export const kpiExplorerQuery = z.object({
  iso_year: z.coerce.number().int(),
  iso_week: z.coerce.number().int().min(1).max(53),
  account_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  project_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
});
export type KpiExplorerQuery = z.infer<typeof kpiExplorerQuery>;

export const kpiRecordQuery = z.object({
  project_id: z.string().uuid(),
  iso_year: z.coerce.number().int(),
  iso_week: z.coerce.number().int().min(1).max(53),
});
export type KpiRecordQuery = z.infer<typeof kpiRecordQuery>;

export const upsertKpiRecordEntryInput = z.object({
  metric_id: z.string().uuid(),
  component_1_value: z.number().nullable(),
  component_2_value: z.number().nullable(),
});

export const upsertKpiRecordInput = z.object({
  project_id: z.string().uuid(),
  iso_year: z.number().int(),
  iso_week: z.number().int().min(1).max(53),
  expected_version: z.number().int().positive().nullable().optional(),
  entries: z.array(upsertKpiRecordEntryInput),
});
export type UpsertKpiRecordInput = z.infer<typeof upsertKpiRecordInput>;

// ── Weekly Reports (FUT-609) ────────────────────────────────────────────────

export const reportColourEnum = z.enum(['green', 'yellow', 'red', 'gray']);

// ── KPI colour semantics (FUT-595) ─────────────────────────────────────────────────────────
// The metric-colour mapping is part of pm's public CONTRACT: the server computes the settled
// colour with these exact functions, and web-pm imports the same functions for its live
// "previewing" badge — one source of truth, so a preview can never disagree with what the
// server will store (AC4: the preview echoes the server's computation by construction).

export type RagStatus = 'green' | 'yellow' | 'red';

export type BandCondition =
  | { op: 'lte' | 'lt' | 'gte' | 'gt' | 'eq'; value: number }
  | { op: 'between'; min: number; max: number }
  | { op: 'or' | 'and'; conditions: BandCondition[] };

/** 2-component metrics are a plain ratio (component_1 / component_2); 1-component metrics use
 * component_1 directly. `null` when a required component isn't filled in yet, or the
 * denominator is zero. */
export function computeMetricValue(
  component_count: 1 | 2,
  component_1_value: number | null,
  component_2_value: number | null,
): number | null {
  if (component_1_value === null) return null;
  if (component_count === 1) return component_1_value;
  if (component_2_value === null || component_2_value === 0) return null;
  return component_1_value / component_2_value;
}

function bandThresholds(cond: BandCondition, out: number[] = []): number[] {
  switch (cond.op) {
    case 'between':
      out.push(cond.min, cond.max);
      break;
    case 'or':
    case 'and':
      for (const c of cond.conditions) bandThresholds(c, out);
      break;
    default:
      out.push(cond.value);
  }
  return out;
}

function decimalsOf(value: number): number {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

export function kpiValuePrecision(
  green_band: BandCondition,
  yellow_band: BandCondition,
  red_band: BandCondition,
): number {
  const marks = [
    ...bandThresholds(green_band),
    ...bandThresholds(yellow_band),
    ...bandThresholds(red_band),
  ];
  return Math.max(...marks.map(decimalsOf));
}

export function computeScoredValue(
  component_count: 1 | 2,
  component_1_value: number | null,
  component_2_value: number | null,
  precision: number,
): number | null {
  if (component_1_value === null) return null;
  const scale = 10 ** precision;
  if (component_count === 1) return Math.round(component_1_value * scale) / scale;
  if (component_2_value === null || component_2_value === 0) return null;
  return Math.round((component_1_value * scale) / component_2_value) / scale;
}

export const KPI_VALUE_MAX_INTEGER_DIGITS = 11;
export const KPI_VALUE_MAX_DECIMALS = 4;

export interface KpiEntryRules {
  component_count: 1 | 2;
  component_1_integer: boolean;
  component_2_integer: boolean;
  component_1_min: number | null;
  component_1_max: number | null;
  is_share: boolean;
  component_2_label?: string | null;
}

export interface KpiEntryIssues {
  component_1: string | null;
  component_2: string | null;
}

function storageIssue(value: number): string | null {
  if (!Number.isFinite(value)) return 'Enter a number';
  if (Math.abs(value) >= 10 ** KPI_VALUE_MAX_INTEGER_DIGITS) {
    return `Max ${KPI_VALUE_MAX_INTEGER_DIGITS} digits`;
  }
  if (Number(value.toFixed(KPI_VALUE_MAX_DECIMALS)) !== value) {
    return `Max ${KPI_VALUE_MAX_DECIMALS} decimals`;
  }
  return null;
}

function componentIssue(
  value: number,
  opts: { integer: boolean; min: number | null; max: number | null },
): string | null {
  const storage = storageIssue(value);
  if (storage) return storage;
  if (opts.integer && !Number.isInteger(value)) return 'Whole number only';
  if (opts.min !== null && value < opts.min) {
    return opts.min === 0 ? "Can't be negative" : `Enter ${opts.min} to ${opts.max ?? '…'}`;
  }
  if (opts.max !== null && value > opts.max) return `Enter ${opts.min ?? '…'} to ${opts.max}`;
  return null;
}

export function kpiComponentIssue(
  rules: KpiEntryRules,
  slot: 1 | 2,
  value: number | null,
): string | null {
  if (value === null) return null;
  if (slot === 2) {
    if (rules.component_count === 1) return null;
    if (value === 0) return "Can't be 0";
    return componentIssue(value, { integer: rules.component_2_integer, min: 0, max: null });
  }
  return componentIssue(value, {
    integer: rules.component_1_integer,
    min: rules.component_1_min,
    max: rules.component_1_max,
  });
}

export function validateKpiEntry(
  rules: KpiEntryRules,
  component_1_value: number | null,
  component_2_value: number | null,
): KpiEntryIssues {
  const issues: KpiEntryIssues = {
    component_1: kpiComponentIssue(rules, 1, component_1_value),
    component_2: kpiComponentIssue(rules, 2, component_2_value),
  };
  if (rules.component_count === 1) return issues;

  if (component_1_value !== null && component_2_value === null) issues.component_2 ??= 'Required';
  if (component_2_value !== null && component_1_value === null) issues.component_1 ??= 'Required';

  if (
    rules.is_share &&
    issues.component_1 === null &&
    issues.component_2 === null &&
    component_1_value !== null &&
    component_2_value !== null &&
    component_1_value > component_2_value
  ) {
    issues.component_1 = `Can't exceed ${rules.component_2_label ?? 'the total'}`;
  }

  return issues;
}

export function hasKpiEntryIssue(issues: KpiEntryIssues): boolean {
  return issues.component_1 !== null || issues.component_2 !== null;
}

export function evaluateBand(cond: BandCondition, value: number): boolean {
  switch (cond.op) {
    case 'lte':
      return value <= cond.value;
    case 'lt':
      return value < cond.value;
    case 'gte':
      return value >= cond.value;
    case 'gt':
      return value > cond.value;
    case 'eq':
      return value === cond.value;
    case 'between':
      return value >= cond.min && value <= cond.max;
    case 'or':
      return cond.conditions.some((c) => evaluateBand(c, value));
    case 'and':
      return cond.conditions.every((c) => evaluateBand(c, value));
  }
}

/** `null` when the metric has no value yet (not entered) — distinct from a real red/yellow/green
 * result. Bands are expected to partition the number line; if none match (malformed norm data)
 * this also returns `null` rather than guessing. */
export function computeEntryStatus(
  value: number | null,
  green_band: BandCondition,
  yellow_band: BandCondition,
  red_band: BandCondition,
): RagStatus | null {
  if (value === null) return null;
  if (evaluateBand(green_band, value)) return 'green';
  if (evaluateBand(yellow_band, value)) return 'yellow';
  if (evaluateBand(red_band, value)) return 'red';
  return null;
}

const RAG_RANK: Record<RagStatus, number> = { green: 0, yellow: 1, red: 2 };

export function worstStatus(statuses: readonly RagStatus[]): RagStatus | null {
  if (statuses.length === 0) return null;
  return statuses.reduce((worst, s) => (RAG_RANK[s] > RAG_RANK[worst] ? s : worst));
}

export function computeCategoryHealth(entryStatuses: readonly RagStatus[]): RagStatus | null {
  return worstStatus(entryStatuses);
}

export function computeOverallHealth(
  categoryHealths: readonly (RagStatus | null)[],
): RagStatus | null {
  return worstStatus(categoryHealths.filter((s): s is RagStatus => s !== null));
}
export const kpiCategoryEnum = z.enum(['quality', 'cost_capacity', 'delivery', 'process']);

export const weeklyReportsQuery = z.object({
  iso_year: z.coerce.number().int(),
  iso_week: z.coerce.number().int().min(1).max(53),
  account_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  project_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
});
export type WeeklyReportsQuery = z.infer<typeof weeklyReportsQuery>;

export const weeklyReportDetailQuery = z.object({
  project_id: z.string().uuid(),
  iso_year: z.coerce.number().int(),
  iso_week: z.coerce.number().int().min(1).max(53),
});
export type WeeklyReportDetailQuery = z.infer<typeof weeklyReportDetailQuery>;

export const upsertWeeklyReportInput = z.object({
  project_id: z.string().uuid(),
  iso_year: z.number().int(),
  iso_week: z.number().int().min(1).max(53),
  expected_version: z.number().int().positive().optional(),
  /** 'draft' saves anything without gate validation and never stamps flags/snapshots; a
   * draft save over a submitted report DEMOTES it (FUT-601 AC4). 'submit' (default) runs
   * the full gate and stamps. */
  save_mode: z.enum(['draft', 'submit']).optional(),
  /** Free for drafts; the submit gate requires it non-empty (checked in the domain). */
  executive_summary: z.string().trim(),
  risk_issue: z.string().nullable().optional(),
  road_to_green: z.string().nullable().optional(),
  road_to_green_owner_id: z.string().uuid().nullable().optional(),
  road_to_green_due: z.string().nullable().optional(),
  // The composer's QCDP dropdowns — the reporter's declared colour per pillar. A pillar that
  // differs from the computed colour becomes an audited override; omitted pillars keep the
  // computed/overridden colour they already had.
  category_colours: z
    .object({
      quality: reportColourEnum.optional(),
      cost_capacity: reportColourEnum.optional(),
      delivery: reportColourEnum.optional(),
      process: reportColourEnum.optional(),
    })
    .optional(),
});
export type UpsertWeeklyReportInput = z.infer<typeof upsertWeeklyReportInput>;

/** FUT-591: create-if-absent the reporter's draft for a (Project, Week) on context entry —
 * idempotent; the same identity rules as upsert (assigned reporter, open week only). */
export const ensureWeeklyReportInput = z.object({
  project_id: z.string().uuid(),
  iso_year: z.number().int(),
  iso_week: z.number().int().min(1).max(53),
});
export type EnsureWeeklyReportInput = z.infer<typeof ensureWeeklyReportInput>;

// Discard the reporter's abandoned draft-on-entry (same identity as ensure). Only a pristine,
// never-saved draft is removed — see discardWeeklyReport for the guard.
export const discardWeeklyReportInput = ensureWeeklyReportInput;
export type DiscardWeeklyReportInput = z.infer<typeof discardWeeklyReportInput>;

// Overriding a computed colour is a governance action — the reason is mandatory so the
// flag_audit_entry trail stays meaningful (system-computed entries are the only reason-less ones).
export const overrideFlagInput = z.object({
  project_id: z.string().uuid(),
  iso_year: z.number().int(),
  iso_week: z.number().int().min(1).max(53),
  category: kpiCategoryEnum,
  final_colour: reportColourEnum,
  reason: z.string().trim().min(1),
});
export type OverrideFlagInput = z.infer<typeof overrideFlagInput>;

export const addReportCommentInput = z.object({
  report_id: z.string().uuid(),
  parent_comment_id: z.string().uuid().nullable().optional(),
  body: z.string().trim().min(1),
});
export type AddReportCommentInput = z.infer<typeof addReportCommentInput>;

export const reassignWorkerAllocationsInput = z.object({
  worker_id: z.string().uuid(),
  allocation_ids: z.array(z.string().uuid()),
  source: z.object({
    date_to: z.string(),
  }),
  targets: z
    .array(
      z.object({
        project_id: z.string().uuid(),
        date_from: z.string(),
        planned_pct: z.number().min(0).max(100),
        bucket: z.enum(['billable', 'internal', 'bench']).optional().default('billable'),
        date_to: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .min(1),
});
export type ReassignWorkerAllocationsInput = z.infer<typeof reassignWorkerAllocationsInput>;
