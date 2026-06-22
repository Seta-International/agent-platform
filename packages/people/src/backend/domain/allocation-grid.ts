import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { projectProjection, worker, workerAllocationProjection } from '../db/schema.ts';
import { PeopleError } from '../rbac.ts';
import { buildWorkerScope } from './worker-scope.ts';

export interface AllocationGridRow {
  worker_id: string;
  full_name: string;
  account_id: string;
  account_name: string;
  project_id: string;
  project_name: string | null;
  bucket: 'billable' | 'internal' | 'bench' | null;
  months: (number | null)[];
  ytd_pct: number;
  fy_pct: number;
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
export interface AllocationGrid {
  year: number;
  rows: AllocationGridRow[];
  worker_totals: WorkerMonthTotal[];
  kpis: AllocationGridKpis;
}
export interface AllocationGridQuery {
  year?: number;
  /** Filters the returned rows to workers whose name or id matches; KPIs stay scope-level. */
  search?: string;
}

interface RawRow {
  worker_id: string;
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
  if (!can(session, 'people.worker.read') && !can(session, 'people.worker.read.all')) {
    throw new PeopleError('FORBIDDEN', 'Missing permission: people.worker.read', {
      permission: 'people.worker.read',
    });
  }

  const year = query.year ?? new Date().getUTCFullYear();
  const scope = buildWorkerScope(session); // SQL predicate on worker.person_id, or null for read.all

  const where = [
    eq(workerAllocationProjection.tenant_id, session.tenant_id),
    eq(workerAllocationProjection.active, true),
    isNotNull(workerAllocationProjection.worker_id),
  ];
  if (scope) where.push(scope);

  const raw = (await peopleDb()
    .select({
      worker_id: workerAllocationProjection.worker_id,
      full_name: worker.full_name,
      account_id: workerAllocationProjection.account_id,
      account_name: workerAllocationProjection.account_name,
      project_id: workerAllocationProjection.project_id,
      project_name: projectProjection.name,
      bucket: workerAllocationProjection.bucket,
      date_from: workerAllocationProjection.date_from,
      date_to: workerAllocationProjection.date_to,
      planned_pct: workerAllocationProjection.planned_pct,
    })
    .from(workerAllocationProjection)
    .innerJoin(
      worker,
      and(
        eq(worker.person_id, workerAllocationProjection.worker_id),
        eq(worker.tenant_id, workerAllocationProjection.tenant_id),
        sql`${worker.deleted_at} IS NULL`,
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
      asc(worker.full_name),
      asc(workerAllocationProjection.worker_id),
      asc(projectProjection.name),
    )) as RawRow[];

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const nowMonth = new Date().getUTCFullYear() === year ? new Date().getUTCMonth() : 11;

  const rows: AllocationGridRow[] = raw.map((r) => {
    const pct = r.planned_pct == null ? null : Number(r.planned_pct);
    const from = r.date_from ? new Date(`${r.date_from}T00:00:00Z`) : yearStart;
    const to = r.date_to ? new Date(`${r.date_to}T00:00:00Z`) : yearEnd;
    const months: (number | null)[] = [];
    let mm = 0;
    for (let m = 0; m < 12; m++) {
      const [mStart, mEnd] = monthBounds(year, m);
      const active = pct != null && from <= mEnd && to >= mStart;
      months.push(active ? pct : null);
      if (active && pct != null) {
        const ovStart = from > mStart ? from : mStart;
        const ovEnd = to < mEnd ? to : mEnd;
        const frac = workingDays(ovStart, ovEnd) / Math.max(1, workingDays(mStart, mEnd));
        mm += (pct / 100) * frac;
      }
    }
    const activeMonths = months.filter((v): v is number => v != null);
    const ytdActive = months.slice(0, nowMonth + 1).filter((v): v is number => v != null);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      worker_id: r.worker_id,
      full_name: r.full_name,
      account_id: r.account_id,
      account_name: r.account_name,
      project_id: r.project_id,
      project_name: r.project_name,
      bucket: r.bucket,
      months,
      ytd_pct: Math.round(mean(ytdActive)),
      fy_pct: Math.round(mean(activeMonths)),
      total_mm: Math.round(mm * 100) / 100,
    };
  });

  // Per-worker month totals (sum across the worker's projects)
  const byWorker = new Map<string, number[]>();
  for (const r of rows) {
    const acc = byWorker.get(r.worker_id) ?? new Array(12).fill(0);
    for (let m = 0; m < 12; m++) acc[m] += r.months[m] ?? 0;
    byWorker.set(r.worker_id, acc);
  }
  const worker_totals: WorkerMonthTotal[] = [...byWorker.entries()].map(([worker_id, totals]) => ({
    worker_id,
    totals,
    over_months: totals.map((v, i) => (v > 100 ? i : -1)).filter((i) => i >= 0),
  }));

  const memberCount = byWorker.size;
  const overCount = worker_totals.filter((w) => w.over_months.length > 0).length;
  const projectCount = new Set(rows.map((r) => r.project_id)).size;
  const avgUtil = memberCount
    ? Math.round(
        worker_totals.reduce((s, w) => {
          const active = w.totals.filter((v) => v > 0);
          const fy = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
          return s + Math.min(100, fy);
        }, 0) / memberCount,
      )
    : 0;

  // Search filters the table rows (and their totals) to matching workers; the KPIs above stay at
  // the viewer's full scope so the headline figures don't shift as you type.
  const q = (query.search ?? '').trim().toLowerCase();
  const matched = q
    ? new Set(
        rows
          .filter(
            (r) => r.full_name.toLowerCase().includes(q) || r.worker_id.toLowerCase().includes(q),
          )
          .map((r) => r.worker_id),
      )
    : null;
  const outRows = matched ? rows.filter((r) => matched.has(r.worker_id)) : rows;
  const outTotals = matched ? worker_totals.filter((w) => matched.has(w.worker_id)) : worker_totals;

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
  };
}
