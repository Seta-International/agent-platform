import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { peopleDb } from '../db/client.ts';
import { employmentPeriod, worker, workerHistory } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { buildWorkerScope } from './worker-scope.ts';

export interface WorkerRow {
  worker_id: string;
  full_name: string;
  job_title: string | null;
  work_email: string | null;
  phone: string | null;
  gender: string | null;
  portal_access: boolean;
  lifecycle_stage: string | null;
  onboarding_date: string | null;
  offboarding_date: string | null;
  manager_name: string | null;
  accounts: Array<{ id: string; name: string }>;
  skills: Array<{ id: string; name: string }>;
}

export interface ListWorkersQuery {
  search?: string;
  ids?: string[];
  status?: string[];
  account_id?: string[];
  project_id?: string[];
  skill_id?: string[];
  sort?: { field: string; dir: 'asc' | 'desc' };
  page?: number;
  pageSize?: number;
}

const SORT_COLUMNS = {
  full_name: worker.full_name,
  job_title: worker.job_title,
  lifecycle_stage: employmentPeriod.lifecycle_stage,
  onboarding_date: employmentPeriod.start_date,
} as const;

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export async function listWorkers(
  session: SessionScope,
  query: ListWorkersQuery = {},
): Promise<{ rows: WorkerRow[]; total: number }> {
  // read.all grantees need not separately hold read — they see all workers via scope.
  if (!can(session, 'people.worker.read') && !can(session, 'people.worker.read.all')) {
    throw new PeopleError('FORBIDDEN', 'Missing permission: people.worker.read', {
      permission: 'people.worker.read',
    });
  }

  const tenantId = session.tenant_id;
  const filters: SQL[] = [tenantScoped(worker.tenant_id, session), isNull(worker.deleted_at)];

  const scope = buildWorkerScope(session);
  if (scope) filters.push(scope);

  const ids = query.ids?.filter(Boolean);
  if (ids && ids.length > 0) {
    filters.push(inArray(worker.person_id, ids));
  }

  if (query.search) {
    const like = `%${query.search}%`;
    const term = or(
      ilike(worker.full_name, like),
      ilike(worker.work_email, like),
      ilike(worker.job_title, like),
    );
    if (term) filters.push(term);
  }

  if (query.status && query.status.length > 0) {
    filters.push(inArray(employmentPeriod.lifecycle_stage, query.status));
  }

  if (query.account_id && query.account_id.length > 0) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM people.worker_allocation_projection wap
        WHERE wap.worker_id = ${worker.person_id} AND wap.active
          AND wap.tenant_id = ${tenantId}
          AND wap.account_id IN (${sql.join(query.account_id, sql`, `)})
    )`);
  }

  if (query.project_id && query.project_id.length > 0) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM people.worker_allocation_projection wap
        WHERE wap.worker_id = ${worker.person_id} AND wap.active
          AND wap.tenant_id = ${tenantId}
          AND wap.project_id IN (${sql.join(query.project_id, sql`, `)})
    )`);
  }

  if (query.skill_id && query.skill_id.length > 0) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM people.person_skill ps
        WHERE ps.person_id = ${worker.person_id} AND ps.tenant_id = ${tenantId}
          AND ps.skill_id IN (${sql.join(query.skill_id, sql`, `)})
    )`);
  }

  const where = and(...filters);
  const managerAlias = alias(worker, 'manager');

  // pm.worker_id / am_worker_id / lead_worker_id all map to people.person_id — shared human identity.
  const accountsAgg = sql<Array<{ id: string; name: string }>>`(
    SELECT coalesce(
      jsonb_agg(DISTINCT jsonb_build_object('id', wap.account_id, 'name', wap.account_name))
        FILTER (WHERE wap.account_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.worker_allocation_projection wap
    WHERE wap.worker_id = ${worker.person_id} AND wap.active AND wap.tenant_id = ${tenantId}
  )`;

  const skillsAgg = sql<Array<{ id: string; name: string }>>`(
    SELECT coalesce(
      jsonb_agg(DISTINCT jsonb_build_object('id', ps.skill_id, 'name', ps.skill_name))
        FILTER (WHERE ps.skill_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.person_skill ps
    WHERE ps.person_id = ${worker.person_id} AND ps.tenant_id = ${tenantId}
  )`;

  const selection = {
    worker_id: worker.person_id,
    full_name: worker.full_name,
    job_title: worker.job_title,
    work_email: worker.work_email,
    phone: worker.phone,
    gender: worker.gender,
    portal_access: worker.portal_access,
    lifecycle_stage: employmentPeriod.lifecycle_stage,
    onboarding_date: employmentPeriod.start_date,
    offboarding_date: employmentPeriod.end_date,
    manager_name: managerAlias.full_name,
    accounts: accountsAgg,
    skills: skillsAgg,
  };

  const baseQuery = peopleDb()
    .select(selection)
    .from(worker)
    .leftJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, worker.person_id), isNull(employmentPeriod.end_date)),
    )
    .leftJoin(
      managerAlias,
      and(
        eq(managerAlias.person_id, worker.manager_id),
        eq(managerAlias.tenant_id, worker.tenant_id),
        isNull(managerAlias.deleted_at),
      ),
    )
    .where(where);

  // ids resolve path: return every match, unpaginated (picker chip resolution).
  if (ids && ids.length > 0) {
    const rows = await baseQuery.orderBy(asc(worker.full_name));
    return { rows: rows as WorkerRow[], total: rows.length };
  }

  const sortColumn =
    (query.sort && SORT_COLUMNS[query.sort.field as keyof typeof SORT_COLUMNS]) ??
    SORT_COLUMNS.full_name;
  const sortDir = query.sort?.dir === 'desc' ? desc : asc;

  const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(query.page ?? 1, 1);

  const rows = await baseQuery
    .orderBy(sortDir(sortColumn), asc(worker.person_id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const countRows = await peopleDb()
    .select({ value: count() })
    .from(worker)
    .leftJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, worker.person_id), isNull(employmentPeriod.end_date)),
    )
    .where(where);

  return { rows: rows as WorkerRow[], total: countRows[0]?.value ?? 0 };
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
  portal_access: boolean;
  job_title: string | null;
  manager_id: string | null;
  manager_name: string | null;
  accounts: Array<{ id: string; name: string }>;
  skills: Array<{ id: string; name: string }>;
}> {
  requirePermission(session, 'people.worker.read');
  const tenantId = session.tenant_id;
  const managerAlias = alias(worker, 'manager');

  const accountsAgg = sql<Array<{ id: string; name: string }>>`(
    SELECT coalesce(
      jsonb_agg(DISTINCT jsonb_build_object('id', wap.account_id, 'name', wap.account_name))
        FILTER (WHERE wap.account_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.worker_allocation_projection wap
    WHERE wap.worker_id = ${worker.person_id} AND wap.active AND wap.tenant_id = ${tenantId}
  )`;

  const skillsAgg = sql<Array<{ id: string; name: string }>>`(
    SELECT coalesce(
      jsonb_agg(DISTINCT jsonb_build_object('id', ps.skill_id, 'name', ps.skill_name))
        FILTER (WHERE ps.skill_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.person_skill ps
    WHERE ps.person_id = ${worker.person_id} AND ps.tenant_id = ${tenantId}
  )`;

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
      portal_access: worker.portal_access,
      job_title: worker.job_title,
      manager_id: worker.manager_id,
      manager_name: managerAlias.full_name,
      accounts: accountsAgg,
      skills: skillsAgg,
    })
    .from(worker)
    .leftJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, worker.person_id), isNull(employmentPeriod.end_date)),
    )
    .leftJoin(
      managerAlias,
      and(
        eq(managerAlias.person_id, worker.manager_id),
        eq(managerAlias.tenant_id, worker.tenant_id),
        isNull(managerAlias.deleted_at),
      ),
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
