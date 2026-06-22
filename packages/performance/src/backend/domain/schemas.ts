import { z } from 'zod';

/**
 * Canonical shapes for the performance datasets and the NORM evaluation result.
 * Tool I/O and the NORM engine both derive their TS types from these schemas, so
 * the contract has exactly one source of truth.
 *
 * Field names mirror the proposal's dataset map (DS00–DS04c). The data-layer
 * engineer implements `DataAccessPorts` (see `data-access.ts`) returning these
 * shapes; the agent tools never touch SQL directly.
 */

// DS00 — employee master record. The two sensitive fields are nullable because
// the retrieval tool strips them for non-HR audiences before the LLM sees them.
export const EmployeeProfileSchema = z.object({
  memberId: z.string(),
  name: z.string(),
  role: z.string(),
  level: z.string(),
  status: z.enum(['active', 'on_leave', 'terminated', 'bench']),
  joinDate: z.string(),
  tier: z.string(),
  score: z.number(),
  managerId: z.string().nullable(),
  promotionReadiness: z.string().nullable(),
  salaryBand: z.string().nullable(),
});
export type EmployeeProfile = z.infer<typeof EmployeeProfileSchema>;

// DS02 — monthly performance scores.
export const PerformanceDataSchema = z.object({
  period: z.string(), // e.g. '2026-04'
  kpiScore: z.number(),
  classification: z.string(),
  feedbackCategories: z.array(z.string()),
  trend: z.enum(['up', 'flat', 'down']).nullable(),
});
export type PerformanceData = z.infer<typeof PerformanceDataSchema>;

// DS03 — timesheet / log-work compliance.
export const TimesheetDataSchema = z.object({
  period: z.string(),
  otHours: z.number(),
  attendancePct: z.number(),
  complianceFlag: z.boolean(),
  logWorkPct: z.number(),
});
export type TimesheetData = z.infer<typeof TimesheetDataSchema>;

// DS04c — violation / attitude summary.
export const ViolationSummarySchema = z.object({
  riskFlag: z.boolean(),
  openCount: z.number(),
  criticalCount: z.number(),
  history: z.array(
    z.object({
      date: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      type: z.string(),
    }),
  ),
});
export type ViolationSummary = z.infer<typeof ViolationSummarySchema>;

// DS01 — resource allocation status.
export const AllocationDataSchema = z.object({
  accountId: z.string(),
  projectId: z.string(),
  allocationPct: z.number(),
  status: z.string(),
  overloadFlag: z.boolean(),
  benchFlag: z.boolean(),
});
export type AllocationData = z.infer<typeof AllocationDataSchema>;

/** Assembled, single-employee profile the NORM engine reasons over. */
export const ProfileSnapshotSchema = z.object({
  employee: EmployeeProfileSchema.nullable(),
  performance: z.array(PerformanceDataSchema).nullable(),
  timesheet: z.array(TimesheetDataSchema).nullable(),
  violations: ViolationSummarySchema.nullable(),
  allocation: AllocationDataSchema.nullable(),
  /** Which retrieval tools returned null, for the partial-response note. */
  missingDatasets: z.array(z.string()),
});
export type ProfileSnapshot = z.infer<typeof ProfileSnapshotSchema>;

// ---- NORM evaluation ----

export const NormCategorySchema = z.enum([
  'kpi',
  'timesheet',
  'allocation',
  'violation',
  'attendance',
  'composite',
]);
export type NormCategory = z.infer<typeof NormCategorySchema>;

export const RiskLevelSchema = z.enum(['critical', 'high', 'medium', 'low', 'none']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const NormRuleResultSchema = z.object({
  ruleId: z.string(),
  category: NormCategorySchema,
  classification: z.string(),
  triggered: z.boolean(),
  detail: z.string(),
});
export type NormRuleResult = z.infer<typeof NormRuleResultSchema>;

// ---- Aggregate read-models (multi-employee / account-level views) ----

/**
 * One row of the at-risk list (Leader view). A pre-classified, pre-summarised
 * entry: the risk level and signal summary are derived server-side (from NORM),
 * so the agent never re-classifies a raw score into a risk band itself.
 */
export const AtRiskEntrySchema = z.object({
  memberId: z.string(),
  name: z.string(),
  risk: RiskLevelSchema,
  /** Compact signal summary, e.g. "KPI below target, OT exceeds limit". */
  summary: z.string(),
  recommendedAction: z.string(),
});
export type AtRiskEntry = z.infer<typeof AtRiskEntrySchema>;

/**
 * Account / workforce-level risk roll-up (BOD view). Counts are the deterministic
 * population breakdown; `narrative` is a short workforce framing.
 */
export const AccountRiskSummarySchema = z.object({
  scopeLabel: z.string(), // e.g. "All accounts" or "Account B — Fintech Platform"
  accountId: z.string().nullable(),
  period: z.string().nullable(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
  total: z.number(),
  narrative: z.string(),
});
export type AccountRiskSummary = z.infer<typeof AccountRiskSummarySchema>;

export const NormResultSchema = z.object({
  /** Deterministic Layer A — all evaluated threshold rules. */
  layerA: z.array(NormRuleResultSchema),
  /**
   * Deterministic composite-risk baseline derived purely from Layer A's
   * triggered set. In the full design, an LLM Layer B refines this; in this
   * draft the main agent reasons about composite risk from `classifiedFacts`.
   */
  compositeRiskBaseline: RiskLevelSchema,
  /**
   * Human-readable, classification-only facts (never raw thresholds) the agent
   * may cite when reasoning about composite risk. Keeping numbers out of this
   * list is what prevents the "4.3 classified as Excellent" hallucination.
   */
  classifiedFacts: z.array(z.string()),
  /** Always true for Layer A (deterministic). Reserved for the Layer B verifier. */
  verificationPassed: z.boolean(),
});
export type NormResult = z.infer<typeof NormResultSchema>;
