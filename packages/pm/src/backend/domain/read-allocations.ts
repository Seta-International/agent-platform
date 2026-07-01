import type { SessionScope } from '@seta/core';
import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { account, allocation, project, workerProjection } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { requirePermission } from '../rbac.ts';

export interface AllocationRow {
  allocation_id: string;
  worker_id: string | null;
  role: string | null;
  planned_pct: number | null;
  bucket: 'billable' | 'internal' | 'bench';
  status: 'placeholder' | 'tentative' | 'committed';
}

export async function listProjectAllocations(input: {
  project_id: string;
  session: SessionScope;
}): Promise<AllocationRow[]> {
  const { project_id, session } = input;
  requirePermission(session, 'pm.project.read');
  const rows = await pmDb()
    .select({
      allocation_id: allocation.id,
      worker_id: allocation.worker_id,
      role: allocation.role,
      planned_pct: allocation.planned_pct,
      bucket: allocation.bucket,
      status: allocation.status,
    })
    .from(allocation)
    .where(
      and(
        eq(allocation.project_id, project_id),
        tenantScoped(allocation.tenant_id, session),
        isNull(allocation.deleted_at),
      ),
    );
  return rows.map((r) => ({
    allocation_id: r.allocation_id,
    worker_id: r.worker_id,
    role: r.role,
    planned_pct: r.planned_pct === null ? null : Number(r.planned_pct),
    bucket: r.bucket as AllocationRow['bucket'],
    status: r.status as AllocationRow['status'],
  }));
}

export interface RaMonitoringRow {
  allocation_id: string;
  worker_id: string | null;
  worker_name: string | null;
  worker_title: string | null;
  role: string | null;
  planned_pct: number | null;
  bucket: 'billable' | 'internal' | 'bench';
  status: 'placeholder' | 'tentative' | 'committed';
  date_from: string | null;
  date_to: string | null;
  note: string | null;
  project_id: string;
  project_name: string;
  account_id: string;
  account_name: string;
  version: number;
}

export async function listAllocations(input: {
  account_id?: string;
  project_id?: string;
  active_from?: string;
  active_to?: string;
  q?: string;
  session: SessionScope;
}): Promise<RaMonitoringRow[]> {
  const { session } = input;
  requirePermission(session, 'pm.project.read');

  const conds = [tenantScoped(allocation.tenant_id, session), isNull(allocation.deleted_at)];
  if (input.project_id) conds.push(eq(allocation.project_id, input.project_id));
  if (input.account_id) conds.push(eq(project.account_id, input.account_id));
  // RBAC-SCOPE: insert buildAllocationScope(session) predicate here (D-1).
  if (input.active_from) {
    conds.push(
      sql`(${allocation.date_to} IS NULL OR ${allocation.date_to} >= ${input.active_from})`,
    );
  }
  if (input.active_to) {
    conds.push(
      sql`(${allocation.date_from} IS NULL OR ${allocation.date_from} <= ${input.active_to})`,
    );
  }
  if (input.q) {
    const like = `%${input.q}%`;
    const searchCond = or(
      ilike(workerProjection.full_name, like),
      ilike(project.name, like),
      ilike(account.name, like),
      ilike(allocation.note, like),
      ilike(allocation.role, like),
    );
    if (searchCond) conds.push(searchCond);
  }

  const rows = await pmDb()
    .select({
      allocation_id: allocation.id,
      worker_id: allocation.worker_id,
      worker_name: workerProjection.full_name,
      worker_title: workerProjection.job_title,
      role: allocation.role,
      planned_pct: allocation.planned_pct,
      bucket: allocation.bucket,
      status: allocation.status,
      date_from: allocation.date_from,
      date_to: allocation.date_to,
      note: allocation.note,
      project_id: allocation.project_id,
      project_name: project.name,
      account_id: project.account_id,
      account_name: account.name,
      version: allocation.version,
    })
    .from(allocation)
    .innerJoin(project, eq(project.id, allocation.project_id))
    .innerJoin(account, eq(account.id, project.account_id))
    .leftJoin(
      workerProjection,
      and(
        eq(workerProjection.worker_id, allocation.worker_id),
        eq(workerProjection.tenant_id, allocation.tenant_id),
      ),
    )
    .where(and(...conds))
    .orderBy(account.name, project.name, workerProjection.full_name);

  return rows.map((r) => ({
    allocation_id: r.allocation_id,
    worker_id: r.worker_id,
    worker_name: r.worker_name ?? null,
    worker_title: r.worker_title ?? null,
    role: r.role,
    planned_pct: r.planned_pct === null ? null : Number(r.planned_pct),
    bucket: r.bucket as RaMonitoringRow['bucket'],
    status: r.status as RaMonitoringRow['status'],
    date_from: r.date_from,
    date_to: r.date_to,
    note: r.note,
    project_id: r.project_id,
    project_name: r.project_name,
    account_id: r.account_id,
    account_name: r.account_name,
    version: r.version,
  }));
}
