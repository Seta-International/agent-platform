// API client for the ARIA performance dashboards.
// Contract: docs/performance-dashboards-api.md — paths, params, and response shapes
// mirror that spec exactly. Do not invent fields here.

const BASE_URL = '/api/performance/v1';

export type RiskFlag = 'None' | 'Minor' | 'Watch' | 'High';

// — GET /dashboard/team response (manager view) —

export interface TeamKpis {
  active_count: number;
  avg_score: number;
  high_risk_count: number;
  watch_count: number;
  declining_count: number;
  overloaded_count: number;
  bench_count: number;
}

export interface TalentQuadrantPoint {
  member_id: string;
  role_title: string;
  avg_score: number; // 0–5
  readiness: number; // 0–1
  risk_flag: RiskFlag;
  allocation_status: string;
}

export interface DeptScore {
  department: string;
  avg_score: number;
  headcount: number;
}

export interface AllocationDistribution {
  active: number;
  bench: number;
  overloaded: number;
}

export interface AtRiskMember {
  member_id: string;
  role_title: string;
  department: string;
  avg_score: number;
  risk_flag: RiskFlag;
  perf_risk_note: string;
  ts_compliance: string;
  allocation_status: string;
}

export interface TeamDashboard {
  kpis: TeamKpis;
  talent_quadrant: TalentQuadrantPoint[];
  dept_scores: DeptScore[];
  allocation_distribution: AllocationDistribution;
  at_risk: AtRiskMember[];
}

/** Thrown when the caller lacks the required dashboard permission (HTTP 403). */
export class ForbiddenError extends Error {
  constructor() {
    super('forbidden');
    this.name = 'ForbiddenError';
  }
}

/** Available review periods (YYYY-MM), most recent first. Drives the period filter. */
export async function fetchPeriods(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/dashboard/periods`, { credentials: 'include', signal });
  if (res.status === 403) throw new ForbiddenError();
  if (!res.ok) throw new Error(`periods request failed: HTTP ${res.status}`);
  const body = (await res.json()) as { periods: string[] };
  return body.periods;
}

/** A review-period window the dashboards aggregate over. */
export interface PeriodWindow {
  from_period?: string; // YYYY-MM
  to_period?: string; // YYYY-MM
}

function periodQuery(win: PeriodWindow): string {
  const params = new URLSearchParams();
  if (win.from_period) params.set('from_period', win.from_period);
  if (win.to_period) params.set('to_period', win.to_period);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function getDashboard<T>(path: string, win: PeriodWindow, signal?: AbortSignal) {
  const res = await fetch(`${BASE_URL}${path}${periodQuery(win)}`, {
    credentials: 'include',
    signal,
  });
  if (res.status === 403) throw new ForbiddenError();
  if (!res.ok) throw new Error(`${path} request failed: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Fetches the team dashboard for a review-period window. Omitted bounds let the
 * server fall back to the most recent period(s) present.
 */
export function fetchTeamDashboard(
  win: PeriodWindow,
  signal?: AbortSignal,
): Promise<TeamDashboard> {
  return getDashboard<TeamDashboard>('/dashboard/team', win, signal);
}

// — GET /dashboard/me response (personal overview) —

export interface MeTrendPoint {
  period: string;
  score: number;
  dept_avg: number;
}

export interface MeDashboard {
  member_id: string;
  role_title: string;
  department: string;
  level: string;
  employment_status: string;
  account_id: string;
  account_name: string;
  allocation_status: string;
  performance_tier: string;
  classification_latest: string;
  avg_score_latest: number;
  avg_score_prev: number | null;
  mom_delta: number | null;
  dept_avg_score: number;
  dept_rank: number;
  dept_headcount: number;
  dept_percentile: number;
  ot_hours_latest: number;
  ts_compliance: string;
  risk_flag: RiskFlag;
  open_violations: number;
  perf_risk_note: string;
  trend: MeTrendPoint[];
  feedback_category_current: string | null;
  feedback_current: string | null;
  feedback_prev: string | null;
}

export function fetchMeDashboard(win: PeriodWindow, signal?: AbortSignal): Promise<MeDashboard> {
  return getDashboard<MeDashboard>('/dashboard/me', win, signal);
}

// — GET /dashboard/org response (executive / board) —

export interface OrgKpis {
  workforce_count: number;
  avg_score: number;
  talent_health_pct: number;
  at_risk_count: number;
  promotion_ready_count: number;
  utilization_pct: number;
}

export interface ScoreHistogramBucket {
  bucket: string;
  count: number;
}

export interface TierDistribution {
  tier: string;
  count: number;
  pct: number;
}

export interface AccountSummary {
  account_id: string;
  account_name: string;
  headcount: number;
  avg_score: number;
  health_pct: number;
  risk_count: number;
  status: string;
}

export interface OrgDashboard {
  kpis: OrgKpis;
  score_histogram: ScoreHistogramBucket[];
  tier_distribution: TierDistribution[];
  account_summary: AccountSummary[];
}

export function fetchOrgDashboard(win: PeriodWindow, signal?: AbortSignal): Promise<OrgDashboard> {
  return getDashboard<OrgDashboard>('/dashboard/org', win, signal);
}
