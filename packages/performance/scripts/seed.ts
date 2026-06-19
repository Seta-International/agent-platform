/**
 * ARIA performance-data seeder.
 *
 *   pnpm --filter @seta/performance db:seed [-- --tenant=<slug|uuid>] [--count=<N>] [--seed=<n>]
 *
 * Seeds the 12 `performance.*` tables for one tenant:
 *   • 3 reference tables (NORM rules, violation types, projects) — verbatim from the ELC file.
 *   • N synthetic employees (default 100) — deterministic from --seed, so re-runs are identical.
 *
 * Raw datasets (employee_master, resource_allocation, performance_by_project,
 * timesheet, violations) are generated; the aggregated datasets (violation_summary,
 * promotion_intent, salary_band, performance_profile) are DERIVED from the raw rows so
 * every number is internally consistent — the property ARIA's anti-hallucination guard relies on.
 *
 * Idempotent: deletes all rows for the target tenant before inserting.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePools, getPool, initPools } from '@seta/shared-db';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import { performanceDb, resetPerformanceDb } from '../src/backend/db/client.ts';
import * as t from '../src/backend/db/schema.ts';
import { NORM_RULES, PROJECTS, VIOLATION_TYPES } from './reference-data.ts';

const log = pino({ name: 'performance/seed' });
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ────────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const TENANT_INPUT = arg('tenant');
const COUNT = Number(arg('count') ?? 100);
const SEED = Number(arg('seed') ?? 42);

// ── Deterministic PRNG (mulberry32) ───────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number, w: number) => String(n).padStart(w, '0');

// ── Reference catalogues used by the generator ────────────────────────────────
const REAL_PROJECTS = PROJECTS.filter(([acc]) => acc !== 'INTERNAL');
const BENCH_PROJECT = PROJECTS.find(([acc]) => acc === 'INTERNAL')!;

interface Family {
  dept: string;
  base: string;
  projRole: string;
  mgr: string;
}
const FAMILIES: Family[] = [
  { dept: 'IT - Engineering', base: 'Software Engineer', projRole: 'BE', mgr: 'EM-001' },
  { dept: 'IT - Engineering', base: 'Software Engineer', projRole: 'FE', mgr: 'EM-002' },
  { dept: 'IT - Engineering', base: 'Software Engineer', projRole: 'Fullstack', mgr: 'EM-003' },
  { dept: 'IT - QA', base: 'QA Engineer', projRole: 'QA', mgr: 'QA-MGR-001' },
  { dept: 'IT - DevOps', base: 'DevOps Engineer', projRole: 'DevOps', mgr: 'TL-DO-001' },
  { dept: 'IT - PM', base: 'Project Manager', projRole: 'PM', mgr: 'PM-001' },
  { dept: 'IT - BA', base: 'Business Analyst', projRole: 'BA', mgr: 'TL-BA-001' },
];

function titleFor(level: number, base: string): string {
  if (level <= 2) return `Junior ${base}`;
  if (level === 3) return base;
  if (level === 4) return `Senior ${base}`;
  if (level === 5) return base.includes('Engineer') ? 'Tech Lead' : `Senior ${base}`;
  if (level === 6)
    return base.includes('Project') ? 'Senior Project Manager' : 'Engineering Manager';
  return 'Delivery Manager';
}

function bandFor(level: number): string {
  return (
    { 1: 'Band A', 2: 'Band A', 3: 'Band B', 4: 'Band C', 5: 'Band D', 6: 'Band E', 7: 'Band F' }[
      level
    ] ?? 'Band C'
  );
}

const REPORTERS = [
  'HR-001',
  'HR-002',
  'MGR-001',
  'MGR-002',
  'MGR-003',
  'MGR-004',
  'SELF',
  'PEER-ANON',
];
const STATUSES = ['Open', 'Under Review', 'Resolved', 'Escalated', 'Closed – No Action'];
const OPEN_STATUSES = new Set(['Open', 'Under Review', 'Escalated']);
const ACTION_BY_STATUS: Record<string, string> = {
  Open: 'Pending',
  'Under Review': 'Pending',
  Resolved: 'Coaching session conducted',
  Escalated: 'Escalated to HR Director',
  'Closed – No Action': 'Pending',
};
const PERIODS = ['2026-03', '2026-04'];
const FEEDBACK_POS = [
  'Consistent delivery and accountability',
  'Consistent performance maintained',
  'Good client management and issue resolution',
  'High learning agility and initiative',
  'Strong leadership and coordination',
  'Strong collaboration and team support',
];
const FEEDBACK_NEU = ['Meets expectations'];
const FEEDBACK_NEG = [
  'Needs additional coaching and support',
  'Performance improvement discussion initiated',
  'Significant gaps in delivery and quality',
  'Performance improvement plan required',
];

function classify(score: number): string {
  if (score >= 4.5) return 'Excellent';
  if (score >= 3.5) return 'Good';
  if (score >= 2.5) return 'Meets Expectations';
  if (score >= 1.5) return 'Below Expectations';
  return 'Poor';
}
function tierFor(avg: number): string {
  if (avg >= 4.3) return 'Exceeds Expectations';
  if (avg >= 2.5) return 'Meets Expectations';
  if (avg >= 1.5) return 'Partially Meets';
  return 'Does Not Meet';
}
function isoDate(rng: () => number, startYear: number, endYear: number): string {
  const year = startYear + Math.floor(rng() * (endYear - startYear + 1));
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  return `${year}-${pad(month, 2)}-${pad(day, 2)}`;
}

// ── Row accumulators (snake_case to match the schema columns) ──────────────────
type Row = Record<string, unknown>;
const employees: Row[] = [];
const allocations: Row[] = [];
const perf: Row[] = [];
const sheets: Row[] = [];
const viols: Row[] = [];
const summaries: Row[] = [];
const promos: Row[] = [];
const salaries: Row[] = [];
const profiles: Row[] = [];

function generate(tenantId: string): void {
  let vioCounter = 1;

  for (let i = 1; i <= COUNT; i++) {
    const rng = mulberry32(SEED * 100003 + i);
    const member_id = `EMP-${pad(i, 3)}`;
    const fam = FAMILIES[Math.floor(rng() * FAMILIES.length)]!;
    const level = pickLevel(rng);

    // Archetype steers score distribution so the dataset has variety + demo-worthy tails.
    let base: number;
    if (i % 13 === 0)
      base = 4.5 + rng() * 0.5; // top performers
    else if (i % 11 === 0)
      base = 1.1 + rng() * 1.3; // at-risk / poor
    else if (i % 7 === 0)
      base = 2.5 + rng() * 0.5; // meets-low
    else base = 3.0 + rng() * 1.4; // good / meets

    const t3 = r2(Math.min(5, Math.max(1, base + (rng() - 0.5) * 0.3)));
    const t4 = r2(Math.min(5, Math.max(1, t3 + (rng() - 0.55) * 0.4))); // slight downward bias
    const avg = r2((t3 + t4) / 2);

    // Allocation archetype.
    const allocRoll = rng();
    const benched = allocRoll < 0.12;
    const overloaded = !benched && allocRoll > 0.85;
    const underAllocated = !benched && !overloaded && allocRoll > 0.78;
    const [accId, , projId] = benched
      ? BENCH_PROJECT
      : REAL_PROJECTS[Math.floor(rng() * REAL_PROJECTS.length)]!;
    const assignment_type = benched ? 'Bench' : rng() < 0.18 ? 'Support' : 'Main Account';
    const allocation_pct = benched
      ? 0
      : underAllocated
        ? 0.5
        : overloaded
          ? 1.0
          : pick(rng, [1.0, 1.0, 1.0, 0.75, 0.8]);
    const work_on_other = overloaded || (!benched && rng() < 0.2) ? 'Yes' : 'No';
    const other =
      work_on_other === 'Yes' ? REAL_PROJECTS[Math.floor(rng() * REAL_PROJECTS.length)]![2] : null;
    const notes = benched
      ? 'Awaiting assignment'
      : overloaded
        ? 'Overloaded'
        : other
          ? `Also 50% on ${other}`
          : null;
    const allocation_status = benched
      ? 'Bench'
      : overloaded
        ? 'Overloaded'
        : underAllocated
          ? 'Under-allocated'
          : 'Active';

    // Employment status.
    let employment_status = 'Active';
    if (avg < 2.0 && rng() < 0.5) employment_status = 'PIP';
    else if (rng() < 0.05) employment_status = 'Resigned';

    employees.push({
      tenant_id: tenantId,
      member_id,
      role_title: titleFor(level, fam.base),
      department: fam.dept,
      level: `L${level}`,
      employment_status,
      join_date: isoDate(rng, 2017, 2025),
      performance_tier: tierFor(avg),
      overall_score_latest: t4,
    });

    allocations.push({
      tenant_id: tenantId,
      member_id,
      account_id: accId,
      project_id: projId,
      assignment_type,
      role: benched ? fam.projRole : fam.projRole,
      report_to: fam.mgr,
      allocation_pct,
      work_on_other,
      other_project_ids: other,
      notes,
    });

    const reviewer = fam.mgr.startsWith('EM') ? fam.mgr : `TL-${fam.projRole}-001`;
    const scoresByPeriod = [t3, t4];
    let tsComplianceT4 = 'Compliant';
    let totalOtT4 = 0;
    for (let p = 0; p < PERIODS.length; p++) {
      const score = scoresByPeriod[p]!;
      const fb =
        score >= 3.5
          ? pick(rng, FEEDBACK_POS)
          : score >= 2.5
            ? pick(rng, FEEDBACK_NEU)
            : pick(rng, FEEDBACK_NEG);
      perf.push({
        tenant_id: tenantId,
        member_id,
        report_period: PERIODS[p],
        reviewer_id: reviewer,
        total_point: score,
        classification: classify(score),
        feedback_category: fb,
        review_frequency: 'Monthly',
      });

      const latePattern = rng() < 0.15;
      const days_late = latePattern ? 3 + Math.floor(rng() * 3) : Math.floor(rng() * 3);
      const days_absent_unapproved = rng() < 0.08 ? 1 : 0;
      const days_leave_approved = rng() < 0.4 ? 1 : 0;
      const days_holiday_official = rng() < 0.4 ? 2 : 0;
      const days_official = 22 - (rng() < 0.5 ? Math.floor(rng() * 4) : 0);
      const actual_work_days = days_official + days_leave_approved + days_holiday_official;
      const otWeekday = overloaded
        ? rng() < 0.1
          ? 40 + Math.floor(rng() * 8)
          : 10 + Math.floor(rng() * 16)
        : Math.floor(rng() * 5) * 2;
      const otWeekend = rng() < 0.1 ? 2 : 0;
      const otHoliday = rng() < 0.15 ? 2 : 0;
      const total_ot = otWeekday + otWeekend + otHoliday;
      const night =
        ['DevOps', 'QA'].includes(fam.projRole) && rng() < 0.3 ? pick(rng, [39, 78, 117]) : 0;
      sheets.push({
        tenant_id: tenantId,
        member_id,
        report_period: PERIODS[p],
        work_days_in_month: 22,
        days_probation: 0,
        days_official,
        days_holiday_official,
        days_leave_approved,
        days_late,
        days_absent_unapproved,
        actual_work_days,
        ot_hours_weekday: otWeekday,
        ot_hours_weekend: otWeekend,
        ot_hours_holiday: otHoliday,
        total_ot_hours: total_ot,
        night_shift_hours: night,
      });

      if (p === PERIODS.length - 1) {
        totalOtT4 = total_ot;
        tsComplianceT4 =
          days_absent_unapproved >= 1
            ? 'Unapproved Absence'
            : days_late >= 3
              ? 'Late Pattern'
              : days_late >= 1
                ? 'Minor Late'
                : 'Compliant';
      }
    }

    // Violations — poor performers and overloaded staff skew higher.
    const vioBias = (avg < 2.5 ? 0.5 : 0) + (overloaded ? 0.2 : 0);
    const nViol = rng() < 0.5 - vioBias ? 0 : 1 + Math.floor(rng() * 5);
    const memberViols: Row[] = [];
    const catCount = new Map<string, number>();
    for (let v = 0; v < nViol; v++) {
      // Bias toward attendance/policy (common), away from conduct (rare).
      const roll = rng();
      const vt =
        roll < 0.45
          ? VIOLATION_TYPES[Math.floor(rng() * 11)]! // attendance + attitude
          : roll < 0.85
            ? VIOLATION_TYPES[11 + Math.floor(rng() * 10)]! // performance + policy
            : VIOLATION_TYPES[21 + Math.floor(rng() * 5)]!; // conduct
      const [category, code, desc, severity, consequence] = vt;
      const status = pick(rng, STATUSES);
      catCount.set(category, (catCount.get(category) ?? 0) + 1);
      const row: Row = {
        tenant_id: tenantId,
        violation_id: `VIO-${pad(vioCounter++, 4)}`,
        member_id,
        category,
        violation_type_code: code,
        violation_type_desc: desc,
        severity,
        consequence,
        status,
        incident_date: isoDate(rng, 2023, 2025),
        reported_by: pick(rng, REPORTERS),
        action_taken: ACTION_BY_STATUS[status] ?? 'Pending',
      };
      memberViols.push(row);
      viols.push(row);
    }

    // DERIVED · violation_summary
    const sev = (s: string) => memberViols.filter((m) => m.severity === s).length;
    const critical_count = sev('Critical');
    const high_count = sev('High');
    const medium_count = sev('Medium');
    const low_count = sev('Low');
    const open_cases = memberViols.filter((m) => OPEN_STATUSES.has(m.status as string)).length;
    const risk_flag =
      critical_count > 0 || open_cases >= 3
        ? 'High Risk'
        : high_count > 0 || open_cases >= 1
          ? 'Watch'
          : nViol > 0
            ? 'Minor'
            : 'None';
    summaries.push({
      tenant_id: tenantId,
      member_id,
      total_violations: nViol,
      critical_count,
      high_count,
      medium_count,
      low_count,
      open_cases,
      risk_flag,
    });

    // DERIVED · promotion_intent
    const targetLevel = Math.min(level + 1, 8);
    const readiness = r2(
      Math.min(0.97, Math.max(0.05, 0.1 + (avg / 5) * 0.8 + (rng() - 0.5) * 0.15)),
    );
    promos.push({
      tenant_id: tenantId,
      member_id,
      current_level: `L${level}`,
      target_level: `L${targetLevel}`,
      readiness_score: readiness,
    });

    // DERIVED · salary_band
    const band = bandFor(level);
    salaries.push({
      tenant_id: tenantId,
      member_id,
      salary_band: band,
      effective_date: isoDate(rng, 2022, 2025),
    });

    // DERIVED · performance_profile (DS-08)
    const flags: string[] = [];
    if (avg >= 4.5) flags.push('Top Performer');
    if (avg < 2.5) flags.push('Low KPI (<2.5)');
    if (high_count > 0 || critical_count > 0) flags.push('High-Risk Violation');
    if (benched) flags.push('Benched');
    if (open_cases >= 2) flags.push('Multiple Open Violations');
    if (tsComplianceT4 === 'Late Pattern') flags.push('Lateness Pattern');
    if (tsComplianceT4 === 'Unapproved Absence') flags.push('Absence Violation');
    profiles.push({
      tenant_id: tenantId,
      member_id,
      avg_score_t3_t4: avg,
      classification_latest: classify(t4),
      ts_compliance_t4: tsComplianceT4,
      total_ot_hours_t4: totalOtT4,
      violation_risk_flag: risk_flag,
      open_violation_count: open_cases,
      allocation_status,
      readiness_score: readiness,
      salary_band: band,
      perf_risk_note: flags.length ? flags.join('; ') : 'No flags',
    });
  }
}

function pickLevel(rng: () => number): number {
  const roll = rng();
  if (roll < 0.18) return 1;
  if (roll < 0.34) return 2;
  if (roll < 0.55) return 3;
  if (roll < 0.78) return 4;
  if (roll < 0.9) return 5;
  if (roll < 0.97) return 6;
  return 7;
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// ── Insert helpers ─────────────────────────────────────────────────────────
async function insertChunked(table: t.AnyPgTable, rows: Row[]): Promise<void> {
  const db = performanceDb();
  for (let i = 0; i < rows.length; i += 500) {
    // biome-ignore lint/suspicious/noExplicitAny: heterogeneous row maps for a one-off seeder
    await db.insert(table).values(rows.slice(i, i + 500) as any);
  }
}

async function resolveTenant(): Promise<{ id: string; label: string }> {
  const pool = getPool('web');
  if (TENANT_INPUT) {
    // scripts/ is outside the raw-SQL lint scope; resolving the tenant by slug/uuid here is fine.
    const res = await pool.query<{ id: string; slug: string }>(
      'SELECT id, slug FROM core.tenants WHERE slug = $1 OR id::text = $1 LIMIT 1',
      [TENANT_INPUT],
    );
    if (!res.rows[0]) throw new Error(`No tenant with slug or id: ${TENANT_INPUT}`);
    return { id: res.rows[0].id, label: res.rows[0].slug };
  }
  const res = await pool.query<{ id: string; slug: string }>(
    'SELECT id, slug FROM core.tenants ORDER BY created_at LIMIT 1',
  );
  if (!res.rows[0]) throw new Error('No tenant found. Run scripts/tenant-bootstrap.sh first.');
  return { id: res.rows[0].id, label: res.rows[0].slug };
}

async function main(): Promise<void> {
  process.loadEnvFile(resolve(__dirname, '../../../.env'));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set (expected in repo-root .env).');
  initPools({ databaseUrl });
  resetPerformanceDb();

  try {
    const tenant = await resolveTenant();
    log.info(
      { tenant: tenant.label, tenantId: tenant.id, count: COUNT, seed: SEED },
      'seeding performance data',
    );

    const tid = tenant.id;
    generate(tid);

    const refNorms = NORM_RULES.map((n) => ({
      tenant_id: tid,
      norm_id: n[0],
      category: n[1],
      rule_description: n[2],
      threshold: n[3],
      classification_label: n[4],
      action_if_triggered: n[5],
      priority: n[6],
      applies_to: n[7],
    }));
    const refTypes = VIOLATION_TYPES.map((v) => ({
      tenant_id: tid,
      category: v[0],
      violation_type_code: v[1],
      violation_type_desc: v[2],
      typical_severity: v[3],
      typical_consequence: v[4],
    }));
    const refProjects = PROJECTS.map((p) => ({
      tenant_id: tid,
      account_id: p[0],
      account_name: p[1],
      project_id: p[2],
      project_name: p[3],
    }));

    const db = performanceDb();
    // Idempotent: clear this tenant's rows first (order is irrelevant — no cross-schema FKs).
    const tables = [
      t.employeeMaster,
      t.resourceAllocation,
      t.performanceByProject,
      t.timesheet,
      t.violations,
      t.violationTypeRef,
      t.violationSummary,
      t.promotionIntent,
      t.salaryBand,
      t.normRules,
      t.performanceProfile,
      t.projectMaster,
    ];
    for (const tbl of tables)
      await db
        .delete(tbl)
        .where(eq((tbl as { tenant_id: typeof t.employeeMaster.tenant_id }).tenant_id, tid));

    await insertChunked(t.normRules, refNorms);
    await insertChunked(t.violationTypeRef, refTypes);
    await insertChunked(t.projectMaster, refProjects);
    await insertChunked(t.employeeMaster, employees);
    await insertChunked(t.resourceAllocation, allocations);
    await insertChunked(t.performanceByProject, perf);
    await insertChunked(t.timesheet, sheets);
    await insertChunked(t.violations, viols);
    await insertChunked(t.violationSummary, summaries);
    await insertChunked(t.promotionIntent, promos);
    await insertChunked(t.salaryBand, salaries);
    await insertChunked(t.performanceProfile, profiles);

    log.info(
      {
        norm_rules: refNorms.length,
        violation_type_ref: refTypes.length,
        project_master: refProjects.length,
        employee_master: employees.length,
        resource_allocation: allocations.length,
        performance_by_project: perf.length,
        timesheet: sheets.length,
        violations: viols.length,
        violation_summary: summaries.length,
        promotion_intent: promos.length,
        salary_band: salaries.length,
        performance_profile: profiles.length,
      },
      'seed complete',
    );
  } finally {
    await closePools();
  }
}

await main();
