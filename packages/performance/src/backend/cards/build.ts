import type { Audience } from '../../rbac.ts';
import type {
  AccountRiskSummary,
  AtRiskEntry,
  NormResult,
  NormRuleResult,
  ProfileSnapshot,
  RiskLevel,
} from '../domain/schemas.ts';
import type {
  AccessDeniedCard,
  AccountSummaryCard,
  AtRiskListCard,
  CardMetric,
  CardRiskLevel,
  EmployeeProfileCard,
  HumanReviewFlagCard,
  InlineTranscriptCard,
} from './schema.ts';

/**
 * Pure builders that turn server-assembled domain data into the card contract.
 * They apply audience-shaped framing (e.g. BOD aggregate name-redaction) as
 * defence in depth on top of the retrieval-boundary redaction. No data is
 * invented here: every value traces back to the datasets or the NORM engine.
 */

/** KPI "meets expectations" floor (NORM-K03). The card shows this as the target. */
const KPI_MEETS_BAR = 3.0;
/** Display policy ceiling for monthly overtime. Presentation-only; the real
 *  policy threshold will come from tenant policy config. */
const OT_MONTHLY_POLICY_LIMIT_HOURS = 40;

/** Domain risk (5 levels) → card risk (4 levels): critical collapses into high. */
export function toCardRisk(level: RiskLevel): CardRiskLevel {
  switch (level) {
    case 'critical':
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'none';
  }
}

/** "2026-04" → "April 2026". Falls back to the raw string if unparseable. */
export function formatPeriod(period: string | null | undefined): string {
  if (!period) return 'current period';
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const month = months[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : period;
}

/** "ACC-B" → "Account B". Leaves anything unrecognised untouched. */
export function accountLabel(accountId: string | null | undefined): string | null {
  if (!accountId) return null;
  const tail = /^ACC-([A-Z0-9]+)$/i.exec(accountId)?.[1];
  return tail ? `Account ${tail.toUpperCase()}` : accountId;
}

function latest<T extends { period: string }>(rows: T[] | null | undefined): T | null {
  if (!rows || rows.length === 0) return null;
  return [...rows].sort((a, b) => a.period.localeCompare(b.period)).at(-1) ?? null;
}

// Classifications that are positive/neutral and must never read as a risk signal.
const NON_RISK_CLASSIFICATIONS = new Set([
  'Excellent',
  'Exceeds Expectations',
  'Meets Expectations',
  'Fully Compliant',
  'Clear',
  'Strong Attendance',
  'High Utilisation',
]);

const CATEGORY_LABEL: Record<NormRuleResult['category'], string> = {
  kpi: 'KPI',
  timesheet: 'Timesheet',
  allocation: 'Allocation',
  violation: 'Compliance',
  attendance: 'Attendance',
  composite: 'Overall',
};

/**
 * Plain-language risk signals from the NORM result. Built from triggered,
 * risk-bearing classifications only — never raw numbers — mirroring the
 * `classifiedFacts` discipline so nothing here can be a re-thresholded value.
 */
export function riskSignals(norm: NormResult): string[] {
  return norm.layerA
    .filter((r) => r.triggered && !NON_RISK_CLASSIFICATIONS.has(r.classification))
    .map((r) => `${CATEGORY_LABEL[r.category]}: ${r.classification}`);
}

/** The NORM verdict label shown on the profile card (latest KPI classification). */
function normResultLabel(profile: ProfileSnapshot, norm: NormResult): string {
  const perf = latest(profile.performance);
  if (perf?.classification) return perf.classification;
  const composite = norm.compositeRiskBaseline;
  return composite === 'none' ? 'No concerns' : `Composite risk: ${composite}`;
}

// --- Card builders ---------------------------------------------------------

export function buildEmployeeProfileCard(
  profile: ProfileSnapshot,
  norm: NormResult,
): EmployeeProfileCard {
  const e = profile.employee;
  const perf = latest(profile.performance);
  const ts = latest(profile.timesheet);
  return {
    type: 'employee_profile_report',
    employee: {
      memberId: e?.memberId ?? 'unknown',
      name: e?.name ?? 'Unknown',
      role: e?.role ?? '',
    },
    riskBadge: toCardRisk(norm.compositeRiskBaseline),
    account: accountLabel(profile.allocation?.accountId ?? null),
    reviewPeriod: formatPeriod(perf?.period ?? null),
    kpi: { score: perf?.kpiScore ?? 0, target: KPI_MEETS_BAR, unit: 'pt' },
    overtime: ts ? { hours: ts.otHours, limit: OT_MONTHLY_POLICY_LIMIT_HOURS, unit: 'h' } : null,
    openViolations: profile.violations?.openCount ?? 0,
    allocationPct: profile.allocation?.allocationPct ?? null,
    normResult: normResultLabel(profile, norm),
    riskSignals: riskSignals(norm),
  };
}

export function buildInlineTranscriptCard(
  profile: ProfileSnapshot,
  norm: NormResult,
): InlineTranscriptCard {
  const e = profile.employee;
  const perf = latest(profile.performance);
  const ts = latest(profile.timesheet);
  const risk = toCardRisk(norm.compositeRiskBaseline);
  const openCount = profile.violations?.openCount ?? 0;

  const metrics: CardMetric[] = [
    {
      label: 'KPI',
      value: perf ? `${perf.kpiScore} (target ${KPI_MEETS_BAR})` : 'n/a',
      emphasis: perf && perf.kpiScore < KPI_MEETS_BAR ? 'danger' : 'normal',
    },
  ];
  if (ts) {
    const over = ts.otHours - OT_MONTHLY_POLICY_LIMIT_HOURS;
    metrics.push({
      label: 'Overtime',
      value: over > 0 ? `${ts.otHours}h (+${over}h over limit)` : `${ts.otHours}h`,
      emphasis: over > 0 ? 'warn' : 'normal',
    });
  }
  metrics.push({
    label: 'Violations',
    value: openCount > 0 ? `${openCount} open` : 'none',
    emphasis: openCount > 0 ? 'warn' : 'normal',
  });
  metrics.push({
    label: 'NORM result',
    value: normResultLabel(profile, norm),
    emphasis: risk === 'high' ? 'danger' : risk === 'medium' ? 'warn' : 'normal',
  });

  const memberId = e?.memberId ?? 'this employee';
  const name = e?.name;
  return {
    type: 'inline_transcript',
    agentName: 'ARIA',
    intro: `Here is the performance profile for ${memberId}${name ? ` — ${name}` : ''} for ${formatPeriod(perf?.period ?? null)}.`,
    metrics,
    footerBadge:
      risk === 'none'
        ? null
        : { label: `${risk.charAt(0).toUpperCase()}${risk.slice(1)} risk`, tone: risk },
    footerNote: risk === 'high' || risk === 'medium' ? 'Flagged for review' : null,
  };
}

export function buildAtRiskListCard(
  entries: AtRiskEntry[],
  scope: { accountLabel?: string | null; period?: string | null },
  audience: Audience,
): AtRiskListCard {
  const scopeBits = [scope.accountLabel, formatPeriod(scope.period)].filter(Boolean);
  const title = `At-risk employees${scopeBits.length ? ` — ${scopeBits.join(', ')}` : ''}`;
  return {
    type: 'at_risk_list',
    title,
    employees: entries.map((entry) => ({
      memberId: entry.memberId,
      // BOD aggregate guardrail: individual names are not surfaced in a list
      // (only on explicit single-employee drill-down). Show the id instead.
      name: audience === 'bod' ? entry.memberId : entry.name,
      riskBadge: toCardRisk(entry.risk),
      summary: entry.summary,
      recommendedAction: entry.recommendedAction,
    })),
  };
}

export function buildAccountSummaryCard(summary: AccountRiskSummary): AccountSummaryCard {
  const total = summary.total || summary.high + summary.medium + summary.low;
  const highPct = total > 0 ? Math.round((summary.high / total) * 100) : 0;
  return {
    type: 'account_summary',
    title: `Talent risk overview — ${summary.scopeLabel}`,
    counts: { high: summary.high, medium: summary.medium, low: summary.low },
    totalEmployees: total,
    highPct,
    narrative: summary.narrative,
  };
}

export function buildAccessDeniedCard(args: {
  message: string;
  currentRole: string;
  requiredRole: string;
  hint?: string | null;
}): AccessDeniedCard {
  return {
    type: 'access_denied',
    title: 'Access restricted',
    message: args.message,
    hint: args.hint ?? 'Contact your HR administrator if you need access to this information.',
    currentRole: args.currentRole,
    requiredRole: args.requiredRole,
  };
}

export function buildHumanReviewFlagCard(args: {
  conclusion: string;
  rationale?: string;
}): HumanReviewFlagCard {
  return {
    type: 'human_review_flag',
    title: 'Requires human review',
    badge: 'SENSITIVE',
    rationale:
      args.rationale ??
      'The following conclusion involves sensitive performance data and must be ' +
        'reviewed by an authorized HR officer before being shared or actioned.',
    conclusion: args.conclusion,
  };
}

/** The display label for an audience tier, used in access-denied copy. */
export function audienceRoleLabel(audience: Audience): string {
  switch (audience) {
    case 'hr':
      return 'HR role';
    case 'leader':
      return 'Leader role';
    default:
      return 'BOD role';
  }
}
