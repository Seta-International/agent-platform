import type { SessionScope } from '@seta/core';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, projectProjection, workerAllocationProjection } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { buildAllocationRowScope, buildWorkerScope } from './worker-scope.ts';

export interface UtilizationSegment {
  project_id: string;
  project_name: string | null;
  pct: number;
}
export interface UtilizationRow {
  worker_id: string;
  employee_no: string | null;
  full_name: string;
  segments: UtilizationSegment[];
  total_pct: number;
  over_allocated: boolean;
  split: { billable: number; internal: number; bench: number };
}
export interface UtilizationByPerson {
  as_of: string;
  rows: UtilizationRow[];
}
export interface UtilizationQuery {
  asOf?: string;
  search?: string;
  status?: 'over' | 'under';
  accountId?: string;
  projectId?: string;
  bucket?: 'billable' | 'internal' | 'bench';
  /**
   * When true, skip account/project row-scope so visible workers include every project segment.
   * Person scope still applies.
   */
  crossProject?: boolean;
}

const UNDER_UTIL_THRESHOLD = 85;

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

function foldText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

interface RawRow {
  worker_id: string;
  employee_no: string | null;
  full_name: string;
  account_id: string;
  project_id: string;
  project_name: string | null;
  bucket: 'billable' | 'internal' | 'bench' | null;
  date_from: string | null;
  date_to: string | null;
  planned_pct: string | null;
}

export async function getUtilizationByPerson(
  session: SessionScope,
  query: UtilizationQuery = {},
): Promise<UtilizationByPerson> {
  requirePermission(session, 'people.worker.read');

  const asOf = query.asOf ?? new Date().toISOString().slice(0, 10);
  const [asOfYear, asOfMon] = asOf.split('-').map(Number);
  const year = asOfYear || new Date().getUTCFullYear();
  const month = asOfMon ? asOfMon - 1 : new Date().getUTCMonth();
  const mStart = new Date(Date.UTC(year, month, 1));
  const mEnd = new Date(Date.UTC(year, month + 1, 0));
  const mStartStr = mStart.toISOString().slice(0, 10);
  const mEndStr = mEnd.toISOString().slice(0, 10);
  const mWorkingDays = workingDays(mStart, mEnd);

  const scope = await buildWorkerScope(session);
  const rowScope = query.crossProject ? null : await buildAllocationRowScope(session);

  const where = [
    eq(workerAllocationProjection.tenant_id, session.tenant_id),
    eq(workerAllocationProjection.active, true),
    isNotNull(workerAllocationProjection.person_id),
    isNotNull(workerAllocationProjection.planned_pct),
    sql`(${workerAllocationProjection.date_from} IS NULL OR ${workerAllocationProjection.date_from} <= ${mEndStr})`,
    sql`(${workerAllocationProjection.date_to} IS NULL OR ${workerAllocationProjection.date_to} >= ${mStartStr})`,
  ];
  if (scope) where.push(scope);
  if (rowScope) where.push(rowScope);

  const raw = (await peopleDb()
    .select({
      worker_id: workerAllocationProjection.person_id,
      employee_no: person.employee_no,
      full_name: person.full_name,
      account_id: workerAllocationProjection.account_id,
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
      projectProjection,
      and(
        eq(projectProjection.project_id, workerAllocationProjection.project_id),
        eq(projectProjection.tenant_id, workerAllocationProjection.tenant_id),
      ),
    )
    .where(and(...where))) as RawRow[];

  const personsWhere = [eq(person.tenant_id, session.tenant_id), sql`${person.deleted_at} IS NULL`];
  if (scope) personsWhere.push(scope);

  const visiblePersons = await peopleDb()
    .select({
      worker_id: person.id,
      employee_no: person.employee_no,
      full_name: person.full_name,
    })
    .from(person)
    .where(and(...personsWhere))
    .orderBy(person.full_name, person.id);

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
    ) {
      return false;
    }
    return true;
  };

  const hasSpecificFilter = Boolean(query.accountId || query.projectId || query.bucket);

  const byWorker = new Map<
    string,
    {
      worker_id: string;
      employee_no: string | null;
      full_name: string;
      segmentMap: Map<string, { project_id: string; project_name: string | null; pct: number }>;
      total_pct: number;
      split: { billable: number; internal: number; bench: number };
    }
  >();

  if (!hasSpecificFilter) {
    for (const p of visiblePersons) {
      if (
        q &&
        !foldText(p.full_name ?? '').includes(q) &&
        !foldText(p.worker_id).includes(q) &&
        !(p.employee_no && foldText(p.employee_no).includes(q))
      ) {
        continue;
      }
      byWorker.set(p.worker_id, {
        worker_id: p.worker_id,
        employee_no: p.employee_no,
        full_name: p.full_name ?? '',
        segmentMap: new Map(),
        total_pct: 0,
        split: { billable: 0, internal: 0, bench: 0 },
      });
    }
  }

  for (const r of raw.filter(rawMatches)) {
    const pct = r.planned_pct == null ? 0 : Number(r.planned_pct);
    const from = r.date_from ? new Date(`${r.date_from}T00:00:00Z`) : mStart;
    const to = r.date_to ? new Date(`${r.date_to}T00:00:00Z`) : mEnd;
    const ovStart = from > mStart ? from : mStart;
    const ovEnd = to < mEnd ? to : mEnd;
    const frac = mWorkingDays > 0 ? workingDays(ovStart, ovEnd) / mWorkingDays : 0;
    const effortPct = Math.round(pct * frac * 100) / 100;
    if (effortPct <= 0) continue;

    let row = byWorker.get(r.worker_id);
    if (!row) {
      if (hasSpecificFilter) {
        row = {
          worker_id: r.worker_id,
          employee_no: r.employee_no,
          full_name: r.full_name ?? '',
          segmentMap: new Map(),
          total_pct: 0,
          split: { billable: 0, internal: 0, bench: 0 },
        };
        byWorker.set(r.worker_id, row);
      } else {
        continue;
      }
    }

    const existingSeg = row.segmentMap.get(r.project_id);
    if (existingSeg) {
      existingSeg.pct = Math.round((existingSeg.pct + effortPct) * 100) / 100;
    } else {
      row.segmentMap.set(r.project_id, {
        project_id: r.project_id,
        project_name: r.project_name,
        pct: effortPct,
      });
    }

    row.total_pct = Math.round((row.total_pct + effortPct) * 100) / 100;
    const bucket = r.bucket ?? 'billable';
    row.split[bucket] = Math.round((row.split[bucket] + effortPct) * 100) / 100;
  }

  const allRows: UtilizationRow[] = [...byWorker.values()].map((row) => ({
    worker_id: row.worker_id,
    employee_no: row.employee_no,
    full_name: row.full_name,
    segments: [...row.segmentMap.values()],
    total_pct: row.total_pct,
    over_allocated: row.total_pct > 100,
    split: row.split,
  }));

  const filteredRows = allRows.filter((r) => {
    if (query.status === 'over') return r.total_pct > 100;
    if (query.status === 'under') return r.total_pct < UNDER_UTIL_THRESHOLD;
    return true;
  });

  return { as_of: asOf, rows: filteredRows };
}
