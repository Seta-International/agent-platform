import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { employmentPeriod, LIFECYCLE_STAGES, worker, workerHistory } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { buildWorkerScope } from './worker-scope.ts';

export interface WorkerRow {
  worker_id: string;
  full_name: string;
  job_title: string | null;
  work_email: string | null;
  personal_email: string | null;
  phone: string | null;
  gender: string | null;
  lifecycle_stage: string | null;
  onboarding_date: string | null;
  offboarding_date: string | null;
  manager_id: string | null;
  manager_name: string | null;
  accounts: Array<{ id: string; name: string }>;
  skills: Array<{ id: string; name: string; level: number | null }>;
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

// F-ORG-3: reporting is derived from org-unit heads, never a hand-typed pointer. A worker's
// manager is their unit's head; a unit head's manager is the parent unit's head.
function derivedManagerIdSql(tenantId: string): SQL<string | null> {
  return sql<string | null>`(
    SELECT CASE
      WHEN ou.head_worker_id = ${worker.person_id} THEN parent_ou.head_worker_id
      ELSE ou.head_worker_id
    END
    FROM people.org_unit ou
    LEFT JOIN people.org_unit parent_ou
      ON parent_ou.id = ou.parent_id AND parent_ou.tenant_id = ou.tenant_id
    WHERE ou.id = ${worker.org_unit_id} AND ou.tenant_id = ${tenantId}
  )`;
}

function managerNameSql(tenantId: string): SQL<string | null> {
  return sql<string | null>`(
    SELECT mh.full_name FROM people.worker mh
      WHERE mh.person_id = ${derivedManagerIdSql(tenantId)}
        AND mh.tenant_id = ${tenantId} AND mh.deleted_at IS NULL
  )`;
}

function derivedOrgUnitNameSql(tenantId: string): SQL<string | null> {
  return sql<string | null>`(
    SELECT ou.name FROM people.org_unit ou
      WHERE ou.id = ${worker.org_unit_id} AND ou.tenant_id = ${tenantId}
  )`;
}

export async function listWorkers(
  session: SessionScope,
  query: ListWorkersQuery = {},
): Promise<{ rows: WorkerRow[]; total: number }> {
  requirePermission(session, 'people.worker.read');

  const tenantId = session.tenant_id;
  const managerName = managerNameSql(tenantId);
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
      sql`EXISTS (
        SELECT 1 FROM people.worker_allocation_projection wap
          WHERE wap.worker_id = ${worker.person_id} AND wap.active
            AND wap.tenant_id = ${tenantId}
            AND wap.account_name ILIKE ${like}
      )`,
      sql`EXISTS (
        SELECT 1 FROM people.person_skill ps
          WHERE ps.person_id = ${worker.person_id}
            AND ps.tenant_id = ${tenantId}
            AND ps.skill_name ILIKE ${like}
      )`,
    );
    if (term) filters.push(term);
  }

  if (query.status && query.status.length > 0) {
    const validStages = query.status.filter((s): s is (typeof LIFECYCLE_STAGES)[number] =>
      (LIFECYCLE_STAGES as readonly string[]).includes(s),
    );
    if (validStages.length > 0) {
      filters.push(inArray(employmentPeriod.lifecycle_stage, validStages));
    }
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

  // pm.worker_id / am_worker_id / lead_worker_id all map to people.person_id — shared human identity.
  const accountsAgg = sql<Array<{ id: string; name: string }>>`(
    SELECT coalesce(
      jsonb_agg(DISTINCT jsonb_build_object('id', wap.account_id, 'name', wap.account_name))
        FILTER (WHERE wap.account_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.worker_allocation_projection wap
    WHERE wap.worker_id = ${worker.person_id} AND wap.active AND wap.tenant_id = ${tenantId}
  )`;

  const skillsAgg = sql<Array<{ id: string; name: string; level: number | null }>>`(
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object('id', ps.skill_id, 'name', ps.skill_name, 'level', ps.level)
        ORDER BY ps.skill_name
      ) FILTER (WHERE ps.skill_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.person_skill ps
    WHERE ps.person_id = ${worker.person_id} AND ps.tenant_id = ${tenantId}
  )`;

  const selection = {
    worker_id: worker.person_id,
    full_name: worker.full_name,
    job_title: worker.job_title,
    work_email: worker.work_email,
    personal_email: worker.personal_email,
    phone: worker.phone,
    gender: worker.gender,
    lifecycle_stage: employmentPeriod.lifecycle_stage,
    onboarding_date: employmentPeriod.start_date,
    offboarding_date: employmentPeriod.end_date,
    manager_name: managerName,
    manager_id: derivedManagerIdSql(tenantId),
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
  personal_email: string | null;
  cv_storage_key: string | null;
  dob: string | null;
  gender: string | null;
  phone: string | null;
  emergency_contact: unknown;
  version: number;
  lifecycle_stage: string | null;
  onboarding_date: string | null;
  offboarding_date: string | null;
  job_title: string | null;
  manager_id: string | null;
  manager_name: string | null;
  org_unit_id: string | null;
  org_unit_name: string | null;
  accounts: Array<{ id: string; name: string }>;
  skills: Array<{ id: string; name: string; level: number | null }>;
}> {
  requirePermission(session, 'people.worker.read');
  const tenantId = session.tenant_id;
  const managerName = managerNameSql(tenantId);
  const orgUnitNameSql = derivedOrgUnitNameSql(tenantId);

  const accountsAgg = sql<Array<{ id: string; name: string }>>`(
    SELECT coalesce(
      jsonb_agg(DISTINCT jsonb_build_object('id', wap.account_id, 'name', wap.account_name))
        FILTER (WHERE wap.account_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.worker_allocation_projection wap
    WHERE wap.worker_id = ${worker.person_id} AND wap.active AND wap.tenant_id = ${tenantId}
  )`;

  const skillsAgg = sql<Array<{ id: string; name: string; level: number | null }>>`(
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object('id', ps.skill_id, 'name', ps.skill_name, 'level', ps.level)
        ORDER BY ps.skill_name
      ) FILTER (WHERE ps.skill_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.person_skill ps
    WHERE ps.person_id = ${worker.person_id} AND ps.tenant_id = ${tenantId}
  )`;

  const scope = buildWorkerScope(session);
  const [row] = await peopleDb()
    .select({
      worker_id: worker.person_id,
      full_name: worker.full_name,
      work_email: worker.work_email,
      personal_email: worker.personal_email,
      cv_storage_key: worker.cv_storage_key,
      dob: worker.dob,
      gender: worker.gender,
      phone: worker.phone,
      emergency_contact: worker.emergency_contact,
      version: worker.version,
      lifecycle_stage: employmentPeriod.lifecycle_stage,
      onboarding_date: employmentPeriod.start_date,
      offboarding_date: employmentPeriod.end_date,
      job_title: worker.job_title,
      manager_name: managerName,
      manager_id: derivedManagerIdSql(tenantId),
      org_unit_id: worker.org_unit_id,
      org_unit_name: orgUnitNameSql,
      accounts: accountsAgg,
      skills: skillsAgg,
    })
    .from(worker)
    .leftJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, worker.person_id), isNull(employmentPeriod.end_date)),
    )
    .where(
      and(
        eq(worker.person_id, worker_id),
        tenantScoped(worker.tenant_id, session),
        scope ?? undefined,
      ),
    )
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
  const scope = buildWorkerScope(session);
  if (scope) {
    const [visible] = await peopleDb()
      .select({ person_id: worker.person_id })
      .from(worker)
      .where(and(eq(worker.person_id, worker_id), tenantScoped(worker.tenant_id, session), scope))
      .limit(1);
    if (!visible) throw new PeopleError('NOT_FOUND', 'worker not found');
  }
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
