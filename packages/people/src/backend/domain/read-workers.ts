import type { SessionScope } from '@seta/core';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { employmentPeriod, worker, workerHistory } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

export async function listWorkers(session: SessionScope): Promise<
  Array<{
    worker_id: string;
    full_name: string;
    work_email: string | null;
    lifecycle_stage: string | null;
  }>
> {
  requirePermission(session, 'people.worker.read');
  const rows = await peopleDb()
    .select({
      worker_id: worker.person_id,
      full_name: worker.full_name,
      work_email: worker.work_email,
      lifecycle_stage: employmentPeriod.lifecycle_stage,
    })
    .from(worker)
    .leftJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, worker.person_id), isNull(employmentPeriod.end_date)),
    )
    .where(and(tenantScoped(worker.tenant_id, session), isNull(worker.deleted_at)));
  return rows;
}

export async function getWorker({
  worker_id,
  session,
}: {
  worker_id: string;
  session: SessionScope;
}): Promise<{
  worker_id: string;
  full_name: string;
  work_email: string | null;
  dob: string | null;
  gender: string | null;
  phone: string | null;
  emergency_contact: unknown;
  version: number;
  lifecycle_stage: string | null;
}> {
  requirePermission(session, 'people.worker.read');
  const [row] = await peopleDb()
    .select({
      worker_id: worker.person_id,
      full_name: worker.full_name,
      work_email: worker.work_email,
      dob: worker.dob,
      gender: worker.gender,
      phone: worker.phone,
      emergency_contact: worker.emergency_contact,
      version: worker.version,
      lifecycle_stage: employmentPeriod.lifecycle_stage,
    })
    .from(worker)
    .leftJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, worker.person_id), isNull(employmentPeriod.end_date)),
    )
    .where(and(eq(worker.person_id, worker_id), tenantScoped(worker.tenant_id, session)))
    .limit(1);
  if (!row) throw new PeopleError('NOT_FOUND', 'worker not found');
  return row;
}

export async function getWorkerHistory({
  worker_id,
  session,
}: {
  worker_id: string;
  session: SessionScope;
}): Promise<
  Array<{
    at: Date;
    action: string;
    field: string | null;
    from_val: unknown;
    to_val: unknown;
    by_user_id: string | null;
  }>
> {
  requirePermission(session, 'people.worker.read');
  const rows = await peopleDb()
    .select({
      at: workerHistory.at,
      action: workerHistory.action,
      field: workerHistory.field,
      from_val: workerHistory.from_val,
      to_val: workerHistory.to_val,
      by_user_id: workerHistory.by_user_id,
    })
    .from(workerHistory)
    .where(
      and(eq(workerHistory.person_id, worker_id), tenantScoped(workerHistory.tenant_id, session)),
    )
    .orderBy(desc(workerHistory.at));
  return rows;
}
