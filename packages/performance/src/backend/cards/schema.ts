import { z } from 'zod';

/**
 * The card contract: the structured JSON the ARIA agent returns when an answer
 * is better shown as a visual card than as prose. This is the single source of
 * truth the frontend ingests — it switches on `card.type` and renders the
 * matching component. The agent never hand-writes this shape; it is produced by
 * the `performance_renderCard` tool from server-assembled data and validated
 * here, so the format is guaranteed and the values are never hallucinated.
 *
 * One variant per demo card in `/demo`:
 *   - employee_profile_report  full single-employee report
 *   - inline_transcript        compact in-chat answer card (ARIA response)
 *   - at_risk_list             multi-employee risk list (Leader view)
 *   - account_summary          aggregate workforce risk (BOD view)
 *   - access_denied            RBAC guardrail when the audience lacks access
 *   - human_review_flag        sensitive conclusion requiring human approval
 */

/** Card-facing risk level. Mapped from the domain `RiskLevel` (critical→high). */
export const CardRiskLevelSchema = z.enum(['high', 'medium', 'low', 'none']);
export type CardRiskLevel = z.infer<typeof CardRiskLevelSchema>;

/** A labelled metric line, used by the compact inline-transcript card. */
export const CardMetricSchema = z.object({
  label: z.string(),
  value: z.string(),
  /** Visual emphasis hint for the frontend; defaults to neutral. */
  emphasis: z.enum(['normal', 'warn', 'danger']).default('normal'),
});
export type CardMetric = z.infer<typeof CardMetricSchema>;

// --- 1. Employee profile report -------------------------------------------
export const EmployeeProfileCardSchema = z.object({
  type: z.literal('employee_profile_report'),
  employee: z.object({
    memberId: z.string(),
    name: z.string(),
    role: z.string(),
  }),
  riskBadge: CardRiskLevelSchema,
  /** Display label for the account/project, e.g. "Account B — Fintech Platform". */
  account: z.string().nullable(),
  /** Human-readable review period, e.g. "April 2026". */
  reviewPeriod: z.string(),
  kpi: z.object({
    score: z.number(),
    target: z.number(),
    /** Unit the frontend appends, e.g. "%" or "pt". */
    unit: z.string(),
  }),
  overtime: z.object({ hours: z.number(), limit: z.number(), unit: z.string() }).nullable(),
  openViolations: z.number(),
  allocationPct: z.number().nullable(),
  /** NORM verdict label, e.g. "Below expectation". */
  normResult: z.string(),
  /** Plain-language risk signals; empty when no signals fired. */
  riskSignals: z.array(z.string()),
});
export type EmployeeProfileCard = z.infer<typeof EmployeeProfileCardSchema>;

// --- 2. Inline transcript (compact agent response) ------------------------
export const InlineTranscriptCardSchema = z.object({
  type: z.literal('inline_transcript'),
  agentName: z.string().default('ARIA'),
  /** One-line lead-in, e.g. "Here is the performance profile for EMP-031…". */
  intro: z.string(),
  metrics: z.array(CardMetricSchema),
  footerBadge: z.object({ label: z.string(), tone: CardRiskLevelSchema }).nullable().default(null),
  footerNote: z.string().nullable().default(null),
});
export type InlineTranscriptCard = z.infer<typeof InlineTranscriptCardSchema>;

// --- 3. At-risk employee list (Leader view) -------------------------------
export const AtRiskListCardSchema = z.object({
  type: z.literal('at_risk_list'),
  /** e.g. "At-risk employees — Account B, April 2026". */
  title: z.string(),
  employees: z.array(
    z.object({
      memberId: z.string(),
      name: z.string(),
      riskBadge: CardRiskLevelSchema,
      /** Compact signal summary, e.g. "KPI 72% (target 85%), OT exceeds limit". */
      summary: z.string(),
      /** Suggested next step, e.g. "Schedule 1:1, review workload allocation". */
      recommendedAction: z.string(),
    }),
  ),
});
export type AtRiskListCard = z.infer<typeof AtRiskListCardSchema>;

// --- 4. Account-level summary (BOD view) ----------------------------------
export const AccountSummaryCardSchema = z.object({
  type: z.literal('account_summary'),
  /** e.g. "Talent risk overview — All accounts". */
  title: z.string(),
  counts: z.object({ high: z.number(), medium: z.number(), low: z.number() }),
  totalEmployees: z.number(),
  /** Percentage of the population flagged high-risk, for the headline bar. */
  highPct: z.number(),
  /** One-paragraph workforce-level narrative. */
  narrative: z.string(),
});
export type AccountSummaryCard = z.infer<typeof AccountSummaryCardSchema>;

// --- 5. Access denied (RBAC guardrail) ------------------------------------
export const AccessDeniedCardSchema = z.object({
  type: z.literal('access_denied'),
  title: z.string().default('Access restricted'),
  /** What was denied and why, in plain language. */
  message: z.string(),
  hint: z.string().nullable().default(null),
  /** The caller's current role label, e.g. "Leader role". */
  currentRole: z.string(),
  /** The role/permission required, e.g. "HR role required". */
  requiredRole: z.string(),
});
export type AccessDeniedCard = z.infer<typeof AccessDeniedCardSchema>;

// --- 6. Human review flag (sensitive conclusion) --------------------------
export const HumanReviewFlagCardSchema = z.object({
  type: z.literal('human_review_flag'),
  title: z.string().default('Requires human review'),
  badge: z.string().nullable().default('SENSITIVE'),
  /** Why this needs a human, e.g. "involves sensitive performance data…". */
  rationale: z.string(),
  /** The sensitive conclusion itself, held for approval before it is actioned. */
  conclusion: z.string(),
});
export type HumanReviewFlagCard = z.infer<typeof HumanReviewFlagCardSchema>;

/**
 * The full card union the frontend ingests. Discriminated on `type` so both the
 * Zod parser and the frontend renderer can switch exhaustively.
 */
export const CardPayloadSchema = z.discriminatedUnion('type', [
  EmployeeProfileCardSchema,
  InlineTranscriptCardSchema,
  AtRiskListCardSchema,
  AccountSummaryCardSchema,
  AccessDeniedCardSchema,
  HumanReviewFlagCardSchema,
]);
export type CardPayload = z.infer<typeof CardPayloadSchema>;

/** The card-type identifiers, reused for the tool's input enum. */
export const CARD_TYPES = [
  'employee_profile_report',
  'inline_transcript',
  'at_risk_list',
  'account_summary',
  'access_denied',
  'human_review_flag',
] as const;
export type CardType = (typeof CARD_TYPES)[number];
