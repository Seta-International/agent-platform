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
}

interface RawRow {
  worker_id: string;
  employee_no: string | null;
  full_name: string;
  project_id: string;
  project_name: string | null;
  bucket: 'billable' | 'internal' | 'bench' | null;
  planned_pct: string | null;
}

export async function getUtilizationByPerson(
  session: SessionScope,
  query: UtilizationQuery = {},
): Promise<UtilizationByPerson> {
  requirePermission(session, 'people.worker.read');

  const asOf = query.asOf ?? new Date().toISOString().slice(0, 10);
  const scope = await buildWorkerScope(session);
  const rowScope = await buildAllocationRowScope(session);

  const where = [
    eq(workerAllocationProjection.tenant_id, session.tenant_id),
    eq(workerAllocationProjection.active, true),
    isNotNull(workerAllocationProjection.person_id),
    isNotNull(workerAllocationProjection.planned_pct),
    sql`(${workerAllocationProjection.date_from} IS NULL OR ${workerAllocationProjection.date_from} <= ${asOf})`,
    sql`(${workerAllocationProjection.date_to} IS NULL OR ${workerAllocationProjection.date_to} >= ${asOf})`,
  ];
  if (scope) where.push(scope);
  if (rowScope) where.push(rowScope);

  const raw = (await peopleDb()
    .select({
      worker_id: workerAllocationProjection.person_id,
      employee_no: person.employee_no,
      full_name: person.full_name,
      project_id: workerAllocationProjection.project_id,
      project_name: projectProjection.name,
      bucket: workerAllocationProjection.bucket,
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

  const byWorker = new Map<string, UtilizationRow>();
  for (const r of raw) {
    const pct = r.planned_pct == null ? 0 : Number(r.planned_pct);
    let row = byWorker.get(r.worker_id);
    if (!row) {
      row = {
        worker_id: r.worker_id,
        employee_no: r.employee_no,
        full_name: r.full_name ?? '',
        segments: [],
        total_pct: 0,
        over_allocated: false,
        split: { billable: 0, internal: 0, bench: 0 },
      };
      byWorker.set(r.worker_id, row);
    }
    row.segments.push({ project_id: r.project_id, project_name: r.project_name, pct });
    row.total_pct += pct;
    const bucket = r.bucket ?? 'billable';
    row.split[bucket] += pct;
  }

  const rows = [...byWorker.values()].map((row) => ({
    ...row,
    over_allocated: row.total_pct > 100,
  }));

  return { as_of: asOf, rows };
}
