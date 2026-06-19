import type { NormRuleResult, ProfileSnapshot } from '../schemas.ts';

/**
 * Layer A — deterministic NORM rules with explicit numeric thresholds.
 *
 * Pure functions, no LLM. This is the anti-hallucination foundation: every
 * numeric threshold is applied here, in code, and the LLM (the main agent) only
 * ever receives the resulting *classifications*, never the raw number to
 * threshold itself.
 *
 * THRESHOLDS BELOW ARE PLACEHOLDERS. The real values must be transcribed from
 * the DS07 NORM sheet before this ships — see the evaluation note. They are
 * structured so that swapping a constant cannot change rule identity or count.
 *
 * 21 deterministic rules across 5 categories (KPI 5, Timesheet 4, Allocation 4,
 * Violation 4, Attendance 4). The 6 composite-risk rules are Layer B (LLM) in
 * the full design and are not evaluated here.
 */

/** Pick the most recent row by `period` (lexically sortable, e.g. '2026-04'). */
function latest<T extends { period: string }>(rows: T[] | null): T | null {
  if (!rows || rows.length === 0) return null;
  return [...rows].sort((a, b) => a.period.localeCompare(b.period)).at(-1) ?? null;
}

function rule(
  ruleId: string,
  category: NormRuleResult['category'],
  triggered: boolean,
  classification: string,
  detail: string,
): NormRuleResult {
  return { ruleId, category, triggered, classification, detail };
}

function kpiRules(profile: ProfileSnapshot): NormRuleResult[] {
  const perf = latest(profile.performance);
  if (!perf) return [];
  const s = perf.kpiScore;
  // Exactly one of these classifications applies to a given score.
  return [
    rule('NORM-K01', 'kpi', s >= 4.5, 'Excellent', `KPI ${s} ≥ 4.5`),
    rule('NORM-K02', 'kpi', s >= 4.0 && s < 4.5, 'Exceeds Expectations', `4.0 ≤ KPI ${s} < 4.5`),
    rule('NORM-K03', 'kpi', s >= 3.0 && s < 4.0, 'Meets Expectations', `3.0 ≤ KPI ${s} < 4.0`),
    rule('NORM-K04', 'kpi', s >= 2.5 && s < 3.0, 'Below Expectations', `2.5 ≤ KPI ${s} < 3.0`),
    rule('NORM-K05', 'kpi', s < 2.5, 'At Risk', `KPI ${s} < 2.5`),
  ];
}

function timesheetRules(profile: ProfileSnapshot): NormRuleResult[] {
  const ts = latest(profile.timesheet);
  if (!ts) return [];
  return [
    rule(
      'NORM-T01',
      'timesheet',
      ts.logWorkPct < 80,
      'Log-work Non-compliant',
      `log-work ${ts.logWorkPct}% < 80%`,
    ),
    rule('NORM-T02', 'timesheet', ts.otHours > 60, 'Excessive OT', `OT ${ts.otHours}h > 60h`),
    rule(
      'NORM-T03',
      'timesheet',
      !ts.complianceFlag,
      'Timesheet Non-compliant',
      `compliance flag = ${ts.complianceFlag}`,
    ),
    rule(
      'NORM-T04',
      'timesheet',
      ts.logWorkPct >= 95 && ts.complianceFlag,
      'Fully Compliant',
      `log-work ${ts.logWorkPct}% ≥ 95% and compliant`,
    ),
  ];
}

function allocationRules(profile: ProfileSnapshot): NormRuleResult[] {
  const a = profile.allocation;
  if (!a) return [];
  const benched = a.benchFlag || a.allocationPct === 0;
  return [
    rule(
      'NORM-A01',
      'allocation',
      a.allocationPct > 120 || a.overloadFlag,
      'Overloaded',
      `allocation ${a.allocationPct}% > 120%`,
    ),
    rule(
      'NORM-A02',
      'allocation',
      a.allocationPct > 100 && a.allocationPct <= 120,
      'High Utilisation',
      `100% < allocation ${a.allocationPct}% ≤ 120%`,
    ),
    rule(
      'NORM-A03',
      'allocation',
      benched,
      'Benched',
      `bench flag = ${a.benchFlag}, allocation ${a.allocationPct}%`,
    ),
    rule(
      'NORM-A04',
      'allocation',
      !benched && a.allocationPct < 60,
      'Underutilised',
      `allocation ${a.allocationPct}% < 60%`,
    ),
  ];
}

function violationRules(profile: ProfileSnapshot): NormRuleResult[] {
  const v = profile.violations;
  if (!v) return [];
  return [
    rule(
      'NORM-V01',
      'violation',
      v.criticalCount > 0,
      'High Risk',
      `${v.criticalCount} critical violation(s)`,
    ),
    rule(
      'NORM-V02',
      'violation',
      v.criticalCount === 0 && v.openCount > 0,
      'Open Cases',
      `${v.openCount} open case(s)`,
    ),
    rule('NORM-V03', 'violation', v.riskFlag, 'Flagged', `risk flag = ${v.riskFlag}`),
    rule(
      'NORM-V04',
      'violation',
      v.openCount === 0 && v.criticalCount === 0,
      'Clear',
      'no open or critical violations',
    ),
  ];
}

function attendanceRules(profile: ProfileSnapshot): NormRuleResult[] {
  const ts = latest(profile.timesheet);
  if (!ts) return [];
  return [
    rule(
      'NORM-AT01',
      'attendance',
      ts.attendancePct < 90,
      'Attendance Flag',
      `attendance ${ts.attendancePct}% < 90%`,
    ),
    rule(
      'NORM-AT02',
      'attendance',
      ts.attendancePct < 80,
      'Severe Attendance Flag',
      `attendance ${ts.attendancePct}% < 80%`,
    ),
    rule('NORM-AT03', 'attendance', ts.otHours > 80, 'Burnout Risk', `OT ${ts.otHours}h > 80h`),
    rule(
      'NORM-AT04',
      'attendance',
      ts.attendancePct >= 98,
      'Strong Attendance',
      `attendance ${ts.attendancePct}% ≥ 98%`,
    ),
  ];
}

/** Evaluate all 21 deterministic Layer A rules over an assembled profile. */
export function evaluateLayerA(profile: ProfileSnapshot): NormRuleResult[] {
  return [
    ...kpiRules(profile),
    ...timesheetRules(profile),
    ...allocationRules(profile),
    ...violationRules(profile),
    ...attendanceRules(profile),
  ];
}
