import { z } from 'zod';

export const genderValue = z.enum(['male', 'female', 'prefer_not_to_say']);
export type GenderValue = z.infer<typeof genderValue>;
export const GENDER_VALUES = genderValue.options;

export const provisionWorkerInput = z.object({
  full_name: z.string().min(1),
  start_date: z.string(),
  employment_type: z.string(),
});
export type ProvisionWorkerInput = z.infer<typeof provisionWorkerInput>;

export const createWorkerInput = z.object({
  full_name: z.string().min(1),
  employee_no: z.string().optional(),
  work_email: z.string().email().optional(),
  personal_email: z.string().email().optional(),
  start_date: z.string().optional(),
  employment_type: z.string().optional(),
  dob: z.string().optional(),
  gender: genderValue.optional(),
  phone: z.string().optional(),
  emergency_contact: z.unknown().optional(),
  job_title: z.string().optional(),
  org_unit_id: z.string().uuid().optional(),
});
export type CreateWorkerInput = z.infer<typeof createWorkerInput>;

export const editWorkerPatch = z.object({
  full_name: z.string().min(1).optional(),
  work_email: z.string().email().optional(),
  personal_email: z.string().email().nullable().optional(),
  cv_storage_key: z.string().min(1).nullable().optional(),
  phone: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  gender: genderValue.nullable().optional(),
  emergency_contact: z.unknown().optional(),
  job_title: z.string().nullable().optional(),
  org_unit_id: z.string().uuid().nullable().optional(),
  employee_no: z.string().nullable().optional(),
});
export const editWorkerInput = z.object({
  worker_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  patch: editWorkerPatch,
});
export type EditWorkerInput = z.infer<typeof editWorkerInput>;

export const orgUnitKind = z.enum(['executive', 'operation', 'function', 'delivery', 'pmo']);
export type OrgUnitKind = z.infer<typeof orgUnitKind>;

export const createOrgUnitInput = z.object({
  name: z.string().min(1),
  kind: orgUnitKind,
  parent_id: z.string().uuid().nullable().optional(),
  head_worker_id: z.string().uuid().nullable().optional(),
  sort: z.number().int().optional(),
});
export type CreateOrgUnitInput = z.infer<typeof createOrgUnitInput>;

export const updateOrgUnitPatch = z.object({
  name: z.string().min(1).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  head_worker_id: z.string().uuid().nullable().optional(),
});
export type UpdateOrgUnitPatch = z.infer<typeof updateOrgUnitPatch>;

export const updateOrgUnitInput = z.object({
  org_unit_id: z.string().uuid(),
  patch: updateOrgUnitPatch,
});

export const deleteOrgUnitInput = z.object({
  org_unit_id: z.string().uuid(),
});

export const performanceContextInput = z.object({
  as_of_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), // YYYY-MM
});
export type PerformanceContextInput = z.infer<typeof performanceContextInput>;

const monthYm = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const cycleStatusQuery = z.object({
  month: monthYm,
  /** Account in view — a manual unlock (FUT-781) is scoped to one account. */
  account_id: z.string().uuid().nullish(),
});
export type CycleStatusQuery = z.infer<typeof cycleStatusQuery>;

export const cycleStatusEnum = z.enum(['open', 'makeup', 'locked', 'override']);
export type CycleStatus = z.infer<typeof cycleStatusEnum>;

export const cycleStatusResponse = z.object({
  month: monthYm,
  status: cycleStatusEnum,
  /** UTC ISO of the transaction-start timestamp used for classification. */
  evaluated_at: z.string().datetime(),
});
export type CycleStatusResponse = z.infer<typeof cycleStatusResponse>;

// --- Manual cycle unlock (FUT-781) ---------------------------------------

export const unlockAction = z.enum(['unlock', 'relock']);
export type UnlockAction = z.infer<typeof unlockAction>;

/** A manual unlock may reopen an account's cycle for at most this many days. */
export const UNLOCK_MAX_DAYS = 5;

/** PMO reopens one account's review month for a bounded number of days. */
export const cycleUnlockInput = z.object({
  month: monthYm,
  account_id: z.string().uuid(),
  days: z.number().int().min(1).max(UNLOCK_MAX_DAYS),
});
export type CycleUnlockInput = z.infer<typeof cycleUnlockInput>;

/** PMO closes an account's window before it expires on its own. */
export const cycleRelockInput = z.object({
  month: monthYm,
  account_id: z.string().uuid(),
});
export type CycleRelockInput = z.infer<typeof cycleRelockInput>;

export const cycleUnlockEntry = z.object({
  id: z.string().uuid(),
  review_month: monthYm,
  account_id: z.string().uuid(),
  action: unlockAction,
  /** When the window closes; null on re-lock rows (effective immediately). */
  expires_at: z.string().datetime().nullable(),
  actor_person_id: z.string().uuid().nullable(),
  actor_user_id: z.string().uuid(),
  created_at: z.string().datetime(),
});
export type CycleUnlockEntry = z.infer<typeof cycleUnlockEntry>;

export const cycleUnlockAccountState = z.object({
  account_id: z.string().uuid(),
  name: z.string(),
  /** ISO deadline of the running unlock, or null when the account is locked. */
  unlocked_until: z.string().datetime().nullable(),
});
export type CycleUnlockAccountState = z.infer<typeof cycleUnlockAccountState>;

/**
 * Everything the PMO unlock panel needs: the one month that may be unlocked right
 * now (the latest closed cycle), each account's current state, and the immutable
 * trail for that month, newest first.
 */
export const cycleUnlockPanel = z.object({
  unlockable_month: monthYm,
  max_days: z.number().int(),
  accounts: z.array(cycleUnlockAccountState),
  entries: z.array(cycleUnlockEntry),
});
export type CycleUnlockPanel = z.infer<typeof cycleUnlockPanel>;

export type PerformanceCapacity =
  | { kind: 'am'; account_id: string; label: string }
  | { kind: 'tl'; project_id: string; account_id: string; label: string }
  | { kind: 'member'; project_id: string; account_id: string; label: string };

export const performanceCapacity = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('am'), account_id: z.string().uuid(), label: z.string() }),
  z.object({
    kind: z.literal('tl'),
    project_id: z.string().uuid(),
    account_id: z.string().uuid(),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('member'),
    project_id: z.string().uuid(),
    account_id: z.string().uuid(),
    label: z.string(),
  }),
]);

export const monthTasksQuery = z.object({
  month: monthYm,
});
export type MonthTasksQuery = z.infer<typeof monthTasksQuery>;

/** Server-authored home to-do cards (FUT-695) — FE echoes only. */
export const monthTaskCard = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unscored'),
    unscored: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    interactive: z.boolean(),
  }),
  z.object({
    kind: z.literal('self_assessment'),
    submitted: z.boolean(),
    interactive: z.boolean(),
  }),
  z.object({
    kind: z.literal('morale'),
    submitted: z.boolean(),
    interactive: z.boolean(),
  }),
  z.object({
    kind: z.literal('cycle_locked'),
  }),
]);
export type MonthTaskCard = z.infer<typeof monthTaskCard>;

export const monthTaskGroup = z.object({
  capacity: performanceCapacity,
  label: z.string(),
  cards: z.array(monthTaskCard),
});
export type MonthTaskGroup = z.infer<typeof monthTaskGroup>;

export const monthTasksResponse = z.object({
  month: monthYm,
  cycle_status: cycleStatusEnum,
  groups: z.array(monthTaskGroup),
});
export type MonthTasksResponse = z.infer<typeof monthTasksResponse>;

/**
 * The Performance surface's entry context ("EmployeePort" read). Discriminated
 * on `status`: `no_employee_record` is a first-class state (renders the
 * "Contact HR" block screen), never a 403/404.
 */
export type PerformanceContext =
  | { status: 'no_employee_record' }
  | {
      status: 'ok';
      as_of_month: string;
      person: { person_id: string; full_name: string | null; org_unit_id: string | null };
      /** Session RBAC role slugs (pm.pmo, pm.bod, people.manager, …) for SCR-02 routing. */
      role_slugs: string[];
      /** Sorted: am < tl < member, then label asc, then id asc — deterministic (AC4). */
      capacities: PerformanceCapacity[];
      default_capacity_index: 0 | -1;
      /**
       * True iff the session holds `people.performance.read_org` — gates the explicit
       * "Organization" (strategic/PMO) view. Org mode is a deliberate choice, never a
       * fallback for capacity-less users (FUT-781).
       */
      can_view_org: boolean;
      /** True iff the session holds `people.performance.unlock` — gates the PMO unlock panel. */
      can_unlock: boolean;
    };

const weightPct = z.number().finite().min(0).max(100);

export const performanceConfigCriterionInput = z.object({
  name: z.string().min(1).max(200),
  weight: weightPct,
  sort: z.number().int().nonnegative().optional(),
});
export type PerformanceConfigCriterionInput = z.infer<typeof performanceConfigCriterionInput>;

export const performanceConfigGroupInput = z.object({
  group_id: z.string().uuid(),
  weight: weightPct,
  criteria: z.array(performanceConfigCriterionInput).min(1),
});
export type PerformanceConfigGroupInput = z.infer<typeof performanceConfigGroupInput>;

export const savePerformanceConfigInput = z.object({
  account_id: z.string().uuid(),
  base_revision_no: z.number().int().positive(),
  groups: z.array(performanceConfigGroupInput).min(1),
});
export type SavePerformanceConfigInput = z.infer<typeof savePerformanceConfigInput>;

export const performanceConfigCriterionView = z.object({
  id: z.string().uuid(),
  name: z.string(),
  weight: z.number(),
  sort: z.number().int(),
});
export type PerformanceConfigCriterionView = z.infer<typeof performanceConfigCriterionView>;

export const performanceConfigGroupView = z.object({
  group_id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  sort: z.number().int(),
  weight: z.number(),
  criteria: z.array(performanceConfigCriterionView),
});
export type PerformanceConfigGroupView = z.infer<typeof performanceConfigGroupView>;

export const performanceConfigResponse = z.object({
  account_id: z.string().uuid(),
  revision_no: z.number().int().positive(),
  revision_id: z.string().uuid(),
  applies_to_next_cycle: z.boolean(),
  groups: z.array(performanceConfigGroupView),
});
export type PerformanceConfigResponse = z.infer<typeof performanceConfigResponse>;

export const savePerformanceConfigResponse = z.object({
  revision_no: z.number().int().positive(),
  revision_id: z.string().uuid(),
  applies_to_next_cycle: z.boolean(),
});
export type SavePerformanceConfigResponse = z.infer<typeof savePerformanceConfigResponse>;

// --- Evaluate (FUT-784) ---------------------------------------------------

export const evaluationStatus = z.enum(['draft', 'submitted']);
export type EvaluationStatus = z.infer<typeof evaluationStatus>;

export const evaluatorCapacity = z.enum(['tl', 'am']);
export type EvaluatorCapacity = z.infer<typeof evaluatorCapacity>;

/** Criterion scores are whole numbers on this scale; nothing outside it is offered (AC2). */
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;
/** Below this a Top Action is mandatory (AC3). */
export const TOP_ACTION_REQUIRED_BELOW = 4;

export const evaluationScoreInput = z.object({
  criterion_id: z.string().uuid(),
  /** Null = not scored yet. A draft may hold nulls; a submit may not (AC4). */
  score: z.number().int().min(SCORE_MIN).max(SCORE_MAX).nullable(),
  evidence: z.string().trim().max(2000).default(''),
});
export type EvaluationScoreInput = z.infer<typeof evaluationScoreInput>;

/** Which evaluation the form is for: one subject, on one project, for one month. */
export const evaluationTargetQuery = z.object({
  month: monthYm,
  subject_person_id: z.string().uuid(),
  project_id: z.string().uuid(),
});
export type EvaluationTargetQuery = z.infer<typeof evaluationTargetQuery>;

export const evaluationWriteInput = z.object({
  month: monthYm,
  subject_person_id: z.string().uuid(),
  project_id: z.string().uuid(),
  /**
   * The version the form was loaded at — a mismatch means another tab wrote (AC8).
   * Zero means "no evaluation existed when I loaded", so only an insert may follow.
   */
  base_version: z.number().int().nonnegative(),
  scores: z.array(evaluationScoreInput),
  strengths: z.string().trim().max(4000).default(''),
  improve: z.string().trim().max(4000).default(''),
  top_action: z.string().trim().max(1000).default(''),
});
export type EvaluationWriteInput = z.infer<typeof evaluationWriteInput>;

export const evaluationCriterionView = z.object({
  criterion_id: z.string().uuid(),
  name: z.string(),
  /** Read-only in the form (AC2). */
  weight: z.number(),
  sort: z.number().int(),
  score: z.number().int().nullable(),
  evidence: z.string(),
  /** True when this criterion's current score makes evidence mandatory (AC3). */
  evidence_required: z.boolean(),
});
export type EvaluationCriterionView = z.infer<typeof evaluationCriterionView>;

export const evaluationGroupView = z.object({
  group_id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  weight: z.number(),
  sort: z.number().int(),
  criteria: z.array(evaluationCriterionView),
});
export type EvaluationGroupView = z.infer<typeof evaluationGroupView>;

/**
 * The evaluation form (AC1). `overall` is null until the evaluation is submitted —
 * the UI renders "—", never 0 and never an estimate (AC5).
 */
export const evaluationView = z.object({
  month: monthYm,
  cycle_status: cycleStatusEnum,
  /** False for a closed month with no unlock — the form renders read-only (AC7). */
  editable: z.boolean(),
  subject: z.object({
    person_id: z.string().uuid(),
    full_name: z.string(),
    project_id: z.string().uuid(),
    project_name: z.string(),
    account_id: z.string().uuid(),
  }),
  evaluator_capacity: evaluatorCapacity,
  status: evaluationStatus,
  /** 0 until the first save; every write bumps it. Echo it back as `base_version`. */
  version: z.number().int().nonnegative(),
  revision_id: z.string().uuid(),
  overall: z.number().nullable(),
  strengths: z.string(),
  improve: z.string(),
  top_action: z.string(),
  /** True when any score is below 4, so a Top Action must be given (AC3). */
  top_action_required: z.boolean(),
  submitted_at: z.string().datetime().nullable(),
  groups: z.array(evaluationGroupView),
});
export type EvaluationView = z.infer<typeof evaluationView>;

// --- Dashboard roll-ups (FUT-784) ----------------------------------------

/**
 * Which slice of the org a dashboard is asking for. Each scope drills exactly one
 * level: org → accounts → projects, account → projects → people, project → people,
 * self → the caller's own projects.
 */
export const rollupScope = z.enum(['org', 'account', 'project', 'self']);
export type RollupScope = z.infer<typeof rollupScope>;

export const performanceRollupQuery = z.object({
  month: monthYm,
  scope: rollupScope,
  account_id: z.string().uuid().nullish(),
  project_id: z.string().uuid().nullish(),
});
export type PerformanceRollupQuery = z.infer<typeof performanceRollupQuery>;

/** One heat-map column. Weights are whole percent and sum to 100 across the axis. */
export const rollupGroupAxis = z.object({
  group_id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  weight: z.number(),
  sort: z.number().int(),
});
export type RollupGroupAxis = z.infer<typeof rollupGroupAxis>;

const rollupRowShape = {
  kind: z.enum(['account', 'project', 'person']),
  id: z.string().uuid(),
  name: z.string(),
  /** Whoever owns the row: the AM of an account, the TL of a project, a person's role. */
  subtitle: z.string(),
  /** Person rows only: this is the project's lead, so their evaluator is the AM. */
  is_lead: z.boolean(),
  member_count: z.number().int().nonnegative(),
  /** Submitted evaluations under this row, out of those expected. */
  scored: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  /** group_id → mean score. A group with no submitted score is absent, never 0. */
  scores: z.record(z.string().uuid(), z.number()),
  /** Null while nothing under this row has been submitted — the UI renders "—". */
  overall: z.number().nullable(),
};

export const rollupLeaf = z.object(rollupRowShape);
export type RollupLeaf = z.infer<typeof rollupLeaf>;

export const rollupRow = z.object({ ...rollupRowShape, children: z.array(rollupLeaf) });
export type RollupRow = z.infer<typeof rollupRow>;

/** A written review the signed-in person received this cycle (`scope: 'self'`). */
export const receivedReview = z.object({
  project_id: z.string().uuid(),
  project_name: z.string(),
  evaluator_name: z.string(),
  evaluator_capacity: evaluatorCapacity,
  status: evaluationStatus,
  overall: z.number().nullable(),
  scores: z.record(z.string().uuid(), z.number()),
  strengths: z.string(),
  improve: z.string(),
  top_action: z.string(),
  submitted_at: z.string().datetime().nullable(),
});
export type ReceivedReview = z.infer<typeof receivedReview>;

/**
 * One shape behind every Performance dashboard. `rows` are already at the requested
 * level with a single level of drill-down in `children`, so the heat map never has to
 * fetch again to expand a row.
 */
export const performanceRollupResponse = z.object({
  month: monthYm,
  cycle_status: cycleStatusEnum,
  scope: rollupScope,
  /** What the header names: the company, an account, a project, or the person. */
  label: z.string(),
  groups: z.array(rollupGroupAxis),
  /** group_id → mean across `rows`; the whole scope as one heat-map column. */
  scores: z.record(z.string().uuid(), z.number()),
  scored: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  overall: z.number().nullable(),
  rows: z.array(rollupRow),
  reviews: z.array(receivedReview),
});
export type PerformanceRollupResponse = z.infer<typeof performanceRollupResponse>;
