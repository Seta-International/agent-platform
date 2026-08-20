import type { SessionScope } from '@seta/core';
import { listAccountManagers } from '@seta/pm';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import {
  accountProjection,
  person,
  projectProjection,
  workerAllocationProjection,
} from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { buildAllocationRowScope, buildWorkerScope } from './worker-scope.ts';

export interface AllocationGridRow {
  worker_id: string;
  employee_no: string | null;
  full_name: string;
  account_id: string;
  account_name: string;
  project_id: string;
  project_name: string | null;
  /** True when this worker is the account manager of the row's account (render account, not project). */
  is_account_am: boolean;
  bucket: 'billable' | 'internal' | 'bench' | null;
  months: (number | null)[];
  total_mm: number;
}
export interface WorkerMonthTotal {
  worker_id: string;
  totals: number[];
  over_months: number[];
}
export interface AllocationGridKpis {
  avg_utilization: number;
  over_allocated_count: number;
  member_count: number;
  project_count: number;
}
export interface AllocationFacets {
  accounts: { id: string; name: string }[];
  projects: { id: string; name: string; account_id: string }[];
}
/** Man-months rolled up per account from the filtered grid rows. */
export interface EffortByAccount {
  account_id: string;
  account_name: string;
  total_mm: number;
}
export interface AllocationGrid {
  year: number;
  rows: AllocationGridRow[];
  worker_totals: WorkerMonthTotal[];
  kpis: AllocationGridKpis;
  /** Distinct accounts/projects across the viewer's full scope, for populating the filter pickers. */
  facets: AllocationFacets;
  /** Effort breakdown over the filtered rows (follows account/project/bucket/search filters). */
  effort_by_account: EffortByAccount[];
}
export type AllocationStatus = 'over' | 'under';
export type AllocationBucket = 'billable' | 'internal' | 'bench';
export interface AllocationGridQuery {
  year?: number;
  /** Accent-insensitive match on worker name, employee ID (`employee_no`), or UUID. Filters rows and recalculates summary KPIs. */
  search?: string;
  /** 'over' = exceeds 100% in some month; 'under' = busiest month stays below the target. */
  status?: AllocationStatus;
  accountId?: string;
  projectId?: string;
  bucket?: AllocationBucket;
  /**
   * When true, skip account/project row-scope (FUT-342) so visible workers show every allocation
   * row. Person scope still applies — workers outside the viewer's reach never appear.
   */
  crossProject?: boolean;
}

// Target utilization; a worker whose busiest month stays below this counts as under-utilized.
const UNDER_UTIL_THRESHOLD = 85;

// Fold a string for accent-insensitive search: lowercase, strip combining diacritics (covers
// Vietnamese tone marks and the horn on ư/ơ, which decompose under NFD), then map đ→d (đ has no
// canonical decomposition so NFD leaves it intact).
function foldText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

interface RawRow {
  worker_id: string;
  employee_no: string | null;
  full_name: string;
  account_id: string;
  account_name: string;
  project_id: string;
  project_name: string | null;
  bucket: 'billable' | 'internal' | 'bench' | null;
  date_from: string | null;
  date_to: string | null;
  planned_pct: string | null;
}

// Working-day (Mon–Fri) count of the [a,b] inclusive date range.
function workingDays(a: Date, b: Date): number {
  if (b < a) return 0;
  let n = 0;
  const d = new Date(a);
  while (d <= b) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

function monthBounds(year: number, m: number): [Date, Date] {
  return [new Date(Date.UTC(year, m, 1)), new Date(Date.UTC(year, m + 1, 0))];
}

export async function getAllocationGrid(
  session: SessionScope,
  query: AllocationGridQuery = {},
): Promise<AllocationGrid> {
  requirePermission(session, 'people.worker.read');

  const year = query.year ?? new Date().getUTCFullYear();
  const scope = await buildWorkerScope(session); // SQL predicate on person.id, or null for tenant scope
  // Default: row-scope hides foreign account/project rows for AM/EM. crossProject opts into full
  // person load for already-visible workers without widening who is visible.
  const rowScope = query.crossProject ? null : await buildAllocationRowScope(session);

  const where = [
    eq(workerAllocationProjection.tenant_id, session.tenant_id),
    eq(workerAllocationProjection.active, true),
    isNotNull(workerAllocationProjection.person_id),
  ];
  if (scope) where.push(scope);
  if (rowScope) where.push(rowScope);

  const raw = (await peopleDb()
    .select({
      worker_id: workerAllocationProjection.person_id,
      employee_no: person.employee_no,
      full_name: person.full_name,
      account_id: workerAllocationProjection.account_id,
      account_name: sql<string>`coalesce(${accountProjection.name}, '')`,
      project_id: workerAllocationProjection.project_id,
      project_name: projectProjection.name,
      bucket: workerAllocationProjection.bucket,
      date_from: workerAllocationProjection.date_from,
      date_to: workerAllocationProjection.date_to,
      planned_pct: workerAllocationProjection.planned_pct,
    })
    .from(workerAllocationProjection)
    .innerJoin(
      person,
      and(
        eq(person.id, workerAllocationProjection.person_id),
        eq(person.tenant_id, workerAllocationProjection.tenant_id),
        sql`${person.deleted_at} IS NULL`,
      ),
    )
    .leftJoin(
      accountProjection,
      and(
        eq(accountProjection.account_id, workerAllocationProjection.account_id),
        eq(accountProjection.tenant_id, workerAllocationProjection.tenant_id),
      ),
    )
    .leftJoin(
      projectProjection,
      and(
        eq(projectProjection.project_id, workerAllocationProjection.project_id),
        eq(projectProjection.tenant_id, workerAllocationProjection.tenant_id),
      ),
    )
    .where(and(...where))
    // Group each person's project rows together (sorted by name) so the grid renders a worker's
    // allocations as one consecutive block.
    .orderBy(
      asc(person.full_name),
      asc(workerAllocationProjection.person_id),
      asc(projectProjection.name),
    )) as RawRow[];

  // Which account each worker is the AM of — so an AM's row renders the account, not the project.
  const amRows = await listAccountManagers(session.tenant_id);
  const amByAccount = new Map(amRows.map((a) => [a.account_id, a.am_person_id]));

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));

  // Facets cover the viewer's full scope (computed before filtering) so the dropdowns stay stable
  // as filters narrow the visible rows.
  const accountFacets = new Map<string, string>();
  const projectFacets = new Map<string, { name: string; account_id: string }>();
  for (const r of raw) {
    accountFacets.set(r.account_id, r.account_name);
    projectFacets.set(r.project_id, { name: r.project_name ?? '—', account_id: r.account_id });
  }

  // Row-level filters (account, project, bucket, search)
  const q = foldText((query.search ?? '').trim());
  const rawMatches = (r: RawRow): boolean => {
    if (query.accountId && r.account_id !== query.accountId) return false;
    if (query.projectId && r.project_id !== query.projectId) return false;
    if (query.bucket && r.bucket !== query.bucket) return false;
    if (
      q &&
      !foldText(r.full_name).includes(q) &&
      !foldText(r.worker_id).includes(q) &&
      !(r.employee_no && foldText(r.employee_no).includes(q))
    )
      return false;
    return true;
  };

  const filteredRaw = raw.filter(rawMatches);

  // Group allocations for the same project (or account for AMs) under each worker into a single row (FUT-850).
  interface ProjectGroup {
    worker_id: string;
    employee_no: string | null;
    full_name: string;
    account_id: string;
    account_name: string;
    project_id: string;
    project_name: string | null;
    is_account_am: boolean;
    records: RawRow[];
  }

  const groupMap = new Map<string, ProjectGroup>();
  for (const r of filteredRaw) {
    const isAm = amByAccount.get(r.account_id) === r.worker_id;
    const groupKey = `${r.worker_id}::${isAm ? `am:${r.account_id}` : `proj:${r.project_id}`}`;
    let group = groupMap.get(groupKey);
    if (!group) {
      group = {
        worker_id: r.worker_id,
        employee_no: r.employee_no,
        full_name: r.full_name,
        account_id: r.account_id,
        account_name: r.account_name,
        project_id: r.project_id,
        project_name: r.project_name,
        is_account_am: isAm,
        records: [],
      };
      groupMap.set(groupKey, group);
    }
    group.records.push(r);
  }

  const rows: AllocationGridRow[] = Array.from(groupMap.values()).map((g) => {
    let bucket: 'billable' | 'internal' | 'bench' | null = null;
    const buckets = g.records.map((r) => r.bucket).filter(Boolean);
    if (buckets.includes('billable')) bucket = 'billable';
    else if (buckets.includes('internal')) bucket = 'internal';
    else if (buckets.includes('bench')) bucket = 'bench';
    else if (buckets.length > 0) bucket = buckets[0] ?? null;

    const months: (number | null)[] = [];
    let mm = 0;
    for (let m = 0; m < 12; m++) {
      const [mStart, mEnd] = monthBounds(year, m);
      const mWorkingDays = workingDays(mStart, mEnd);
      let monthTotalPct = 0;
      let hasActive = false;

      for (const r of g.records) {
        const pct = r.planned_pct == null ? null : Number(r.planned_pct);
        const from = r.date_from ? new Date(`${r.date_from}T00:00:00Z`) : yearStart;
        const to = r.date_to ? new Date(`${r.date_to}T00:00:00Z`) : yearEnd;
        const active = pct != null && from <= mEnd && to >= mStart;
        if (active && pct != null) {
          hasActive = true;
          const ovStart = from > mStart ? from : mStart;
          const ovEnd = to < mEnd ? to : mEnd;
          const frac = mWorkingDays > 0 ? workingDays(ovStart, ovEnd) / mWorkingDays : 0;
          monthTotalPct += pct * frac;
          mm += (pct / 100) * frac;
        }
      }
      months.push(hasActive ? Math.round(monthTotalPct * 100) / 100 : null);
    }

    return {
      worker_id: g.worker_id,
      employee_no: g.employee_no,
      is_account_am: g.is_account_am,
      full_name: g.full_name,
      account_id: g.account_id,
      account_name: g.account_name,
      project_id: g.project_id,
      project_name: g.project_name,
      bucket,
      months,
      total_mm: Math.round(mm * 100) / 100,
    };
  });

  // Per-worker month totals for the filtered scope
  const filteredRawByWorker = new Map<string, RawRow[]>();
  for (const r of filteredRaw) {
    const list = filteredRawByWorker.get(r.worker_id);
    if (list) list.push(r);
    else filteredRawByWorker.set(r.worker_id, [r]);
  }

  const byWorker = new Map<string, number[]>();
  for (const [worker_id, wRows] of filteredRawByWorker.entries()) {
    const totals = new Array<number>(12).fill(0);
    for (let m = 0; m < 12; m++) {
      const [mStart, mEnd] = monthBounds(year, m);
      const mStartStr = mStart.toISOString().slice(0, 10);
      const mEndStr = mEnd.toISOString().slice(0, 10);

      const segs: Array<{ start: string; end: string; pct: number }> = [];
      for (const r of wRows) {
        if (r.planned_pct == null) continue;
        const pct = Number(r.planned_pct);
        const rFrom = r.date_from ?? `${year}-01-01`;
        const rTo = r.date_to ?? `${year}-12-31`;
        if (rFrom <= mEndStr && rTo >= mStartStr) {
          const segStart = rFrom > mStartStr ? rFrom : mStartStr;
          const segEnd = rTo < mEndStr ? rTo : mEndStr;
          segs.push({ start: segStart, end: segEnd, pct });
        }
      }

      let peak = 0;
      for (const s of segs) {
        let sum = 0;
        for (const t of segs) {
          if (t.start <= s.start && s.start <= t.end) sum += t.pct;
        }
        if (sum > peak) peak = sum;
      }
      totals[m] = Math.round(peak * 100) / 100;
    }
    byWorker.set(worker_id, totals);
  }

  const filteredWorkerTotals: WorkerMonthTotal[] = [...byWorker.entries()].map(
    ([worker_id, totals]) => ({
      worker_id,
      totals,
      over_months: totals.map((v, i) => (v > 100 ? i : -1)).filter((i) => i >= 0),
    }),
  );

  // Status predicate ('over' | 'under') — computed for current month only (FUT-911)
  const now = new Date();
  const isCurrentYear = !query.year || query.year === now.getUTCFullYear();
  const currentMonth = isCurrentYear ? now.getUTCMonth() : 0;

  const totalsByWorkerMap = new Map(filteredWorkerTotals.map((w) => [w.worker_id, w]));
  const workerMatchesStatus = (workerId: string): boolean => {
    if (!query.status) return true;
    const wt = totalsByWorkerMap.get(workerId);
    if (query.status === 'over') return wt ? (wt.totals[currentMonth] ?? 0) > 100 : false;
    if (query.status === 'under') {
      const currentLoad = wt ? (wt.totals[currentMonth] ?? 0) : 0;
      return currentLoad < UNDER_UTIL_THRESHOLD;
    }
    return true;
  };

  const outRows = rows.filter((r) => workerMatchesStatus(r.worker_id));
  const keptWorkers = new Set(outRows.map((r) => r.worker_id));
  const outTotals = filteredWorkerTotals.filter((w) => keptWorkers.has(w.worker_id));

  const memberCount = outTotals.length;
  const overCount = outTotals.filter((w) => (w.totals[currentMonth] ?? 0) > 100).length;
  const projectCount = new Set(outRows.map((r) => r.project_id)).size;
  const avgUtil = memberCount
    ? Math.round(
        outTotals.reduce((s, w) => {
          const active = w.totals.filter((v) => v > 0);
          const fy = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
          return s + Math.min(100, fy);
        }, 0) / memberCount,
      )
    : 0;

  // Effort-by-account follows the filtered rows so an account filter still shows a summary.
  const mmByAccount = new Map<string, { account_name: string; total_mm: number }>();
  for (const r of outRows) {
    const prev = mmByAccount.get(r.account_id);
    if (prev) prev.total_mm += r.total_mm;
    else mmByAccount.set(r.account_id, { account_name: r.account_name, total_mm: r.total_mm });
  }
  const effort_by_account: EffortByAccount[] = [...mmByAccount.entries()]
    .map(([account_id, v]) => ({
      account_id,
      account_name: v.account_name,
      total_mm: Math.round(v.total_mm * 100) / 100,
    }))
    // Heaviest accounts first — summary surfaces the top of the portfolio.
    .sort((a, b) => b.total_mm - a.total_mm || a.account_name.localeCompare(b.account_name));

  return {
    year,
    rows: outRows,
    worker_totals: outTotals,
    kpis: {
      avg_utilization: avgUtil,
      over_allocated_count: overCount,
      member_count: memberCount,
      project_count: projectCount,
    },
    facets: {
      accounts: [...accountFacets.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      projects: [...projectFacets.entries()]
        .map(([id, v]) => ({ id, name: v.name, account_id: v.account_id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    effort_by_account,
  };
}
