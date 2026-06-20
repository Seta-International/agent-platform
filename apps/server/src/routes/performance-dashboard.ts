import type { SessionEnv } from '@seta/core';
import { getPool } from '@seta/shared-db';
import type { Hono } from 'hono';

// Performance (ARIA) dashboard endpoints. Contract: docs/performance-dashboards-api.md.
// Raw SQL over performance.* scoped to the session tenant — same app-route pattern as me.ts.

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

type RiskFlag = 'None' | 'Minor' | 'Watch' | 'High';

/** performance_profile.violation_risk_flag stores "High Risk"; the API enum is "High". */
function normalizeRiskFlag(stored: string | null): RiskFlag {
  switch (stored) {
    case 'High Risk':
      return 'High';
    case 'Watch':
      return 'Watch';
    case 'Minor':
      return 'Minor';
    default:
      return 'None';
  }
}

function round(value: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/** Distinct review periods present for the tenant, most-recent first. */
async function listPeriods(tenantId: string): Promise<string[]> {
  const res = await getPool('web').query<{ report_period: string }>(
    `SELECT DISTINCT report_period FROM performance.performance_by_project
     WHERE tenant_id = $1 ORDER BY report_period DESC`,
    [tenantId],
  );
  return res.rows.map((r) => r.report_period);
}

/** Inclusive month count between two YYYY-MM strings (e.g. 2026-04..2026-06 → 3). */
function monthSpan(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if (fy === undefined || fm === undefined || ty === undefined || tm === undefined) return 1;
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

/**
 * Resolve a requested [from_period, to_period] window onto the periods that
 * actually have data. The FE sends ranges from the time-range presets / date
 * picker; the data grain is a monthly review period.
 *  - historical window (to_period ≤ latest data) → the overlapping periods (honest)
 *  - window extends past the latest data (presets anchor to "now", which has no
 *    data yet) → the most-recent N periods, N = the window's month width, so a
 *    1-month preset shows the latest month and a quarter spans ~3 months
 *  - no params → the two most recent periods (spec default)
 * Returns the ascending period list plus the snapshot latest + its predecessor
 * (used for month-over-month / declining signals at the window's leading edge).
 */
function resolveRange(
  periods: string[],
  fromParam: string | undefined,
  toParam: string | undefined,
): { range: string[]; latest: string | null; prev: string | null } {
  const latestAvail = periods[0];
  if (!latestAvail) return { range: [], latest: null, prev: null };
  let range: string[];
  if (fromParam && toParam) {
    if (toParam > latestAvail) {
      // Window runs past available data → most-recent N periods by window width.
      range = [...periods].slice(0, Math.min(monthSpan(fromParam, toParam), periods.length)).sort();
    } else {
      const overlap = periods.filter((p) => p >= fromParam && p <= toParam);
      const upTo = periods.filter((p) => p <= toParam);
      range = overlap.length ? [...overlap].sort() : upTo[0] ? [upTo[0]] : [latestAvail];
    }
  } else if (toParam) {
    const upTo = periods.filter((p) => p <= toParam);
    range = upTo[0] ? [upTo[0]] : [latestAvail];
  } else {
    range = [...periods].slice(0, 2).sort();
  }
  const latest = range[range.length - 1] ?? periods[0] ?? null;
  const prev = latest ? (periods.find((p) => p < latest) ?? null) : null;
  return { range, latest, prev };
}

interface TeamMemberRow {
  member_id: string;
  role_title: string;
  department: string;
  allocation_status: string | null;
  violation_risk_flag: string | null;
  perf_risk_note: string | null;
  ts_compliance_t4: string | null;
  readiness_score: number | null;
  score_range: number | null;
  score_latest: number | null;
  score_prev: number | null;
}

async function fetchActiveTeamRows(
  tenantId: string,
  range: string[],
  latest: string | null,
  prev: string | null,
): Promise<TeamMemberRow[]> {
  const res = await getPool('web').query<TeamMemberRow>(
    `WITH rng AS (
       SELECT member_id, AVG(total_point)::float8 AS score
       FROM performance.performance_by_project
       WHERE tenant_id = $1 AND report_period = ANY($2::text[]) GROUP BY member_id
     ),
     latest AS (
       SELECT member_id, AVG(total_point)::float8 AS score
       FROM performance.performance_by_project
       WHERE tenant_id = $1 AND report_period = $3 GROUP BY member_id
     ),
     prev AS (
       SELECT member_id, AVG(total_point)::float8 AS score
       FROM performance.performance_by_project
       WHERE tenant_id = $1 AND report_period = $4 GROUP BY member_id
     )
     SELECT em.member_id, em.role_title, em.department,
            pp.allocation_status, pp.violation_risk_flag, pp.perf_risk_note,
            pp.ts_compliance_t4, pp.readiness_score,
            r.score AS score_range, l.score AS score_latest, p.score AS score_prev
     FROM performance.employee_master em
     LEFT JOIN performance.performance_profile pp
       ON pp.tenant_id = em.tenant_id AND pp.member_id = em.member_id
     LEFT JOIN rng r ON r.member_id = em.member_id
     LEFT JOIN latest l ON l.member_id = em.member_id
     LEFT JOIN prev p ON p.member_id = em.member_id
     WHERE em.tenant_id = $1 AND em.employment_status = 'Active'
     ORDER BY em.member_id`,
    [tenantId, range, latest, prev],
  );
  return res.rows;
}

const RISK_ORDER: Record<RiskFlag, number> = { High: 0, Watch: 1, Minor: 2, None: 3 };

function invalidPeriod(value: string | undefined): boolean {
  return value !== undefined && !PERIOD_RE.test(value);
}

/** account_id → account_name, resolved from project_master (distinct). */
async function fetchAccountNames(tenantId: string): Promise<Map<string, string>> {
  const res = await getPool('web').query<{ account_id: string; account_name: string }>(
    `SELECT DISTINCT account_id, account_name FROM performance.project_master WHERE tenant_id = $1`,
    [tenantId],
  );
  const map = new Map<string, string>();
  for (const r of res.rows) map.set(r.account_id, r.account_name);
  return map;
}

// — /org —

interface OrgMemberRow {
  performance_tier: string;
  violation_risk_flag: string | null;
  allocation_status: string | null;
  readiness_score: number | null;
  account_id: string | null;
  score_range: number | null;
}

async function fetchActiveOrgRows(tenantId: string, range: string[]): Promise<OrgMemberRow[]> {
  const res = await getPool('web').query<OrgMemberRow>(
    `WITH rng AS (
       SELECT member_id, AVG(total_point)::float8 AS score
       FROM performance.performance_by_project
       WHERE tenant_id = $1 AND report_period = ANY($2::text[]) GROUP BY member_id
     )
     SELECT em.performance_tier,
            pp.violation_risk_flag, pp.allocation_status, pp.readiness_score,
            ra.account_id, r.score AS score_range
     FROM performance.employee_master em
     LEFT JOIN performance.performance_profile pp
       ON pp.tenant_id = em.tenant_id AND pp.member_id = em.member_id
     LEFT JOIN performance.resource_allocation ra
       ON ra.tenant_id = em.tenant_id AND ra.member_id = em.member_id
     LEFT JOIN rng r ON r.member_id = em.member_id
     WHERE em.tenant_id = $1 AND em.employment_status = 'Active'`,
    [tenantId, range],
  );
  return res.rows;
}

// — /me —

// §1 stand-in: the performance schema has no identity→member mapping yet
// (see docs/performance-dashboards-api.md Open dependencies §1). Until an HR
// import populates it, /me resolves to a representative member. The data
// returned is real DB data for that member, not mock.
const SELF_MEMBER_ID = 'EMP-001';

interface MeProfileRow {
  member_id: string;
  role_title: string;
  department: string;
  level: string;
  employment_status: string;
  performance_tier: string;
  account_id: string | null;
  allocation_status: string | null;
  classification_latest: string | null;
  ts_compliance_t4: string | null;
  violation_risk_flag: string | null;
  open_violation_count: number | null;
  perf_risk_note: string | null;
}

async function fetchMeProfile(tenantId: string, memberId: string): Promise<MeProfileRow | null> {
  const res = await getPool('web').query<MeProfileRow>(
    `SELECT em.member_id, em.role_title, em.department, em.level, em.employment_status,
            em.performance_tier,
            ra.account_id,
            pp.allocation_status, pp.classification_latest, pp.ts_compliance_t4,
            pp.violation_risk_flag, pp.open_violation_count, pp.perf_risk_note
     FROM performance.employee_master em
     LEFT JOIN performance.resource_allocation ra
       ON ra.tenant_id = em.tenant_id AND ra.member_id = em.member_id
     LEFT JOIN performance.performance_profile pp
       ON pp.tenant_id = em.tenant_id AND pp.member_id = em.member_id
     WHERE em.tenant_id = $1 AND em.member_id = $2
     LIMIT 1`,
    [tenantId, memberId],
  );
  return res.rows[0] ?? null;
}

interface PeriodScore {
  score: number;
  feedback_category: string | null;
}

/** report_period → { score, feedback_category } for one member. */
async function fetchMemberScores(
  tenantId: string,
  memberId: string,
): Promise<Map<string, PeriodScore>> {
  const res = await getPool('web').query<{
    report_period: string;
    score: number;
    feedback_category: string | null;
  }>(
    `SELECT report_period, AVG(total_point)::float8 AS score,
            MIN(feedback_category) AS feedback_category
     FROM performance.performance_by_project
     WHERE tenant_id = $1 AND member_id = $2
     GROUP BY report_period`,
    [tenantId, memberId],
  );
  const map = new Map<string, PeriodScore>();
  for (const r of res.rows)
    map.set(r.report_period, { score: r.score, feedback_category: r.feedback_category });
  return map;
}

/** All active same-department peers' scores per period (for rank + dept-avg trend). */
async function fetchDeptScores(
  tenantId: string,
  department: string,
): Promise<{ member_id: string; report_period: string; score: number }[]> {
  const res = await getPool('web').query<{
    member_id: string;
    report_period: string;
    score: number;
  }>(
    `SELECT pbp.member_id, pbp.report_period, pbp.total_point::float8 AS score
     FROM performance.performance_by_project pbp
     JOIN performance.employee_master em
       ON em.tenant_id = pbp.tenant_id AND em.member_id = pbp.member_id
     WHERE pbp.tenant_id = $1 AND em.department = $2 AND em.employment_status = 'Active'`,
    [tenantId, department],
  );
  return res.rows;
}

async function fetchOtHours(
  tenantId: string,
  memberId: string,
  period: string | null,
): Promise<number | null> {
  if (!period) return null;
  const res = await getPool('web').query<{ ot: number }>(
    `SELECT SUM(total_ot_hours)::float8 AS ot FROM performance.timesheet
     WHERE tenant_id = $1 AND member_id = $2 AND report_period = $3`,
    [tenantId, memberId, period],
  );
  return res.rows[0]?.ot ?? null;
}

export function registerPerformanceDashboardRoutes(app: Hono<SessionEnv>): void {
  // Available review periods for the tenant — drives the dashboard period filter.
  app.get('/api/performance/v1/dashboard/periods', async (c) => {
    const { permissions, tenant_id } = c.get('user');
    if (!permissions.has('performance.dashboard.read')) {
      return c.json({ error: 'forbidden' }, 403);
    }
    return c.json({ periods: await listPeriods(tenant_id) });
  });

  app.get('/api/performance/v1/dashboard/team', async (c) => {
    const { permissions, tenant_id } = c.get('user');
    if (!permissions.has('performance.dashboard.team.read')) {
      return c.json({ error: 'forbidden' }, 403);
    }

    const fromParam = c.req.query('from_period');
    const toParam = c.req.query('to_period');
    for (const [name, value] of [
      ['from_period', fromParam],
      ['to_period', toParam],
    ] as const) {
      if (value !== undefined && !PERIOD_RE.test(value)) {
        return c.json(
          { error: 'invalid_payload', issues: [{ path: [name], message: 'expected YYYY-MM' }] },
          400,
        );
      }
    }

    const { range, latest, prev } = resolveRange(await listPeriods(tenant_id), fromParam, toParam);
    const rows = await fetchActiveTeamRows(tenant_id, range, latest, prev);

    const members = rows.map((r) => ({
      member_id: r.member_id,
      role_title: r.role_title,
      department: r.department,
      // Headline score = average over the selected period range.
      avg_score: r.score_range ?? r.score_latest ?? 0,
      // Latest vs previous period — drives the declining (trend) signal.
      score_latest: r.score_latest,
      score_prev: r.score_prev,
      readiness: r.readiness_score ?? 0,
      risk_flag: normalizeRiskFlag(r.violation_risk_flag),
      allocation_status: r.allocation_status ?? 'Unknown',
      perf_risk_note: r.perf_risk_note ?? '',
      ts_compliance: r.ts_compliance_t4 ?? 'No data',
    }));

    const activeCount = members.length;
    const avgScore = activeCount
      ? round(members.reduce((s, m) => s + m.avg_score, 0) / activeCount)
      : 0;

    const kpis = {
      active_count: activeCount,
      avg_score: avgScore,
      high_risk_count: members.filter((m) => m.risk_flag === 'High').length,
      watch_count: members.filter((m) => m.risk_flag === 'Watch').length,
      declining_count: members.filter(
        (m) => m.score_latest != null && m.score_prev != null && m.score_latest < m.score_prev,
      ).length,
      overloaded_count: members.filter((m) => m.allocation_status === 'Overloaded').length,
      bench_count: members.filter((m) => m.allocation_status === 'Bench').length,
    };

    const talent_quadrant = members.map((m) => ({
      member_id: m.member_id,
      role_title: m.role_title,
      avg_score: round(m.avg_score),
      readiness: round(m.readiness, 4),
      risk_flag: m.risk_flag,
      allocation_status: m.allocation_status,
    }));

    const deptAgg = new Map<string, { sum: number; count: number }>();
    for (const m of members) {
      const a = deptAgg.get(m.department) ?? { sum: 0, count: 0 };
      a.sum += m.avg_score;
      a.count += 1;
      deptAgg.set(m.department, a);
    }
    const dept_scores = [...deptAgg.entries()]
      .map(([department, a]) => ({
        department,
        avg_score: round(a.sum / a.count),
        headcount: a.count,
      }))
      .sort((x, y) => y.avg_score - x.avg_score);

    const allocation_distribution = {
      overloaded: members.filter((m) => m.allocation_status === 'Overloaded').length,
      bench: members.filter((m) => m.allocation_status === 'Bench').length,
      active: members.filter(
        (m) => m.allocation_status !== 'Overloaded' && m.allocation_status !== 'Bench',
      ).length,
    };

    const at_risk = members
      .filter((m) => m.risk_flag === 'High' || m.risk_flag === 'Watch')
      .sort(
        (x, y) => RISK_ORDER[x.risk_flag] - RISK_ORDER[y.risk_flag] || x.avg_score - y.avg_score,
      )
      .slice(0, 12)
      .map((m) => ({
        member_id: m.member_id,
        role_title: m.role_title,
        department: m.department,
        avg_score: round(m.avg_score),
        risk_flag: m.risk_flag,
        perf_risk_note: m.perf_risk_note,
        ts_compliance: m.ts_compliance,
        allocation_status: m.allocation_status,
      }));

    return c.json({ kpis, talent_quadrant, dept_scores, allocation_distribution, at_risk });
  });

  // Executive / board view — organisation-wide aggregates only, no member records.
  app.get('/api/performance/v1/dashboard/org', async (c) => {
    const { permissions, tenant_id } = c.get('user');
    if (!permissions.has('performance.dashboard.executive.read')) {
      return c.json({ error: 'forbidden' }, 403);
    }
    const fromParam = c.req.query('from_period');
    const toParam = c.req.query('to_period');
    if (invalidPeriod(fromParam) || invalidPeriod(toParam)) {
      return c.json({ error: 'invalid_payload', issues: [{ message: 'expected YYYY-MM' }] }, 400);
    }

    const { range } = resolveRange(await listPeriods(tenant_id), fromParam, toParam);
    const [rows, accountNames] = await Promise.all([
      fetchActiveOrgRows(tenant_id, range),
      fetchAccountNames(tenant_id),
    ]);

    const members = rows.map((r) => ({
      tier: r.performance_tier,
      score: r.score_range ?? 0,
      risk: normalizeRiskFlag(r.violation_risk_flag),
      alloc: r.allocation_status ?? 'Unknown',
      readiness: r.readiness_score ?? 0,
      account_id: r.account_id ?? 'UNKNOWN',
    }));
    const n = members.length;
    const pct = (count: number) => (n ? Math.round((100 * count) / n) : 0);

    const kpis = {
      workforce_count: n,
      avg_score: n ? round(members.reduce((s, m) => s + m.score, 0) / n) : 0,
      talent_health_pct: pct(members.filter((m) => m.score >= 3.5).length),
      at_risk_count: members.filter((m) => m.risk === 'High' || m.risk === 'Watch').length,
      promotion_ready_count: members.filter((m) => m.readiness >= 0.8).length,
      utilization_pct: pct(members.filter((m) => m.alloc === 'Active').length),
    };

    const buckets: { bucket: string; lo: number; hi: number }[] = [
      { bucket: '0–1', lo: 0, hi: 1 },
      { bucket: '1–2', lo: 1, hi: 2 },
      { bucket: '2–3', lo: 2, hi: 3 },
      { bucket: '3–4', lo: 3, hi: 4 },
      { bucket: '4–5', lo: 4, hi: 5.0001 },
    ];
    const score_histogram = buckets.map((b) => ({
      bucket: b.bucket,
      count: members.filter((m) => m.score >= b.lo && m.score < b.hi).length,
    }));

    const TIERS = [
      'Exceeds Expectations',
      'Meets Expectations',
      'Partially Meets',
      'Does Not Meet',
    ];
    const tier_distribution = TIERS.map((tier) => {
      const count = members.filter((m) => m.tier === tier).length;
      return { tier, count, pct: pct(count) };
    });

    const acctAgg = new Map<
      string,
      { headcount: number; sum: number; healthy: number; risk: number }
    >();
    for (const m of members) {
      const a = acctAgg.get(m.account_id) ?? { headcount: 0, sum: 0, healthy: 0, risk: 0 };
      a.headcount += 1;
      a.sum += m.score;
      if (m.score >= 3.5) a.healthy += 1;
      if (m.risk === 'High' || m.risk === 'Watch') a.risk += 1;
      acctAgg.set(m.account_id, a);
    }
    const account_summary = [...acctAgg.entries()]
      .map(([account_id, a]) => {
        const health_pct = a.headcount ? Math.round((100 * a.healthy) / a.headcount) : 0;
        const status = health_pct >= 70 ? 'Healthy' : health_pct >= 40 ? 'Watch' : 'At Risk';
        return {
          account_id,
          account_name: accountNames.get(account_id) ?? account_id,
          headcount: a.headcount,
          avg_score: a.headcount ? round(a.sum / a.headcount) : 0,
          health_pct,
          risk_count: a.risk,
          status,
        };
      })
      .sort((x, y) => y.headcount - x.headcount);

    return c.json({ kpis, score_histogram, tier_distribution, account_summary });
  });

  // Personal overview — the calling user's own performance profile.
  app.get('/api/performance/v1/dashboard/me', async (c) => {
    const { permissions, tenant_id } = c.get('user');
    if (!permissions.has('performance.dashboard.read')) {
      return c.json({ error: 'forbidden' }, 403);
    }
    const fromParam = c.req.query('from_period');
    const toParam = c.req.query('to_period');
    if (invalidPeriod(fromParam) || invalidPeriod(toParam)) {
      return c.json({ error: 'invalid_payload', issues: [{ message: 'expected YYYY-MM' }] }, 400);
    }

    const memberId = SELF_MEMBER_ID;
    const periods = await listPeriods(tenant_id);
    const { range, latest, prev } = resolveRange(periods, fromParam, toParam);

    const profile = await fetchMeProfile(tenant_id, memberId);
    if (!profile) return c.json({ error: 'member_not_found' }, 404);

    const [accountNames, memberScores, deptRows, otHours] = await Promise.all([
      fetchAccountNames(tenant_id),
      fetchMemberScores(tenant_id, memberId),
      fetchDeptScores(tenant_id, profile.department),
      fetchOtHours(tenant_id, memberId, latest),
    ]);

    const scoreLatest = latest ? (memberScores.get(latest)?.score ?? 0) : 0;
    const scorePrev = prev ? (memberScores.get(prev)?.score ?? null) : null;
    const momDelta = scorePrev !== null ? round(scoreLatest - scorePrev) : null;

    // Dept context at the latest period.
    const peerLatest = deptRows.filter((r) => r.report_period === latest);
    const peerIds = new Set(peerLatest.map((r) => r.member_id));
    const deptHeadcount = peerIds.size;
    const deptAvgScore = deptHeadcount
      ? round(peerLatest.reduce((s, r) => s + r.score, 0) / deptHeadcount)
      : 0;
    const deptRank = peerLatest.filter((r) => r.score > scoreLatest).length + 1;
    const deptPercentile = deptHeadcount ? Math.round((1 - deptRank / deptHeadcount) * 100) : 0;

    // Dept average per period (for the trend line).
    const deptAvgByPeriod = new Map<string, { sum: number; count: number }>();
    for (const r of deptRows) {
      const a = deptAvgByPeriod.get(r.report_period) ?? { sum: 0, count: 0 };
      a.sum += r.score;
      a.count += 1;
      deptAvgByPeriod.set(r.report_period, a);
    }

    // Trend = the resolved period range (ascending). When the window is a single
    // period (e.g. the period selector sends one `to_period`), include the prior
    // period too so the trend line still shows movement.
    const trendPeriods =
      range.length === 1 && prev ? [prev, ...range] : range.length ? range : latest ? [latest] : [];
    const trend = trendPeriods.map((p) => {
      const da = deptAvgByPeriod.get(p);
      return {
        period: p,
        score: round(memberScores.get(p)?.score ?? 0),
        dept_avg: da ? round(da.sum / da.count) : 0,
      };
    });

    return c.json({
      member_id: profile.member_id,
      role_title: profile.role_title,
      department: profile.department,
      level: profile.level,
      employment_status: profile.employment_status,
      account_id: profile.account_id ?? 'UNKNOWN',
      account_name: accountNames.get(profile.account_id ?? '') ?? profile.account_id ?? 'Unknown',
      allocation_status: profile.allocation_status ?? 'Unknown',
      performance_tier: profile.performance_tier,
      classification_latest: profile.classification_latest ?? 'No data',
      avg_score_latest: round(scoreLatest),
      avg_score_prev: scorePrev !== null ? round(scorePrev) : null,
      mom_delta: momDelta,
      dept_avg_score: deptAvgScore,
      dept_rank: deptRank,
      dept_headcount: deptHeadcount,
      dept_percentile: deptPercentile,
      ot_hours_latest: otHours ?? 0,
      ts_compliance: profile.ts_compliance_t4 ?? 'No data',
      risk_flag: normalizeRiskFlag(profile.violation_risk_flag),
      open_violations: profile.open_violation_count ?? 0,
      perf_risk_note: profile.perf_risk_note ?? '',
      trend,
      feedback_category_current: latest
        ? (memberScores.get(latest)?.feedback_category ?? null)
        : null,
      feedback_current: null, // SCHEMA GAP — no prose column (Open dependencies §2)
      feedback_prev: null, // SCHEMA GAP
    });
  });
}
