import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { employmentPeriod, LIFECYCLE_STAGES, person, personHistory } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { personPhotoUrl } from './photo.ts';
import { buildWorkerScope } from './worker-scope.ts';

/** Swaps the raw storage key for the app path clients render — the key never leaves the module. */
function withPhotoUrl<T extends { worker_id: string; photo_storage_key: string | null }>(
  row: T,
): Omit<T, 'photo_storage_key'> & { photo_url: string | null } {
  const { photo_storage_key, ...rest } = row;
  return { ...rest, photo_url: personPhotoUrl(row.worker_id, photo_storage_key) };
}

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
  org_unit_id: string | null;
  org_unit_name: string | null;
  accounts: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  skills: Array<{ id: string; name: string }>;
  employee_no: string | null;
  /** App path to the M365 photo, or null when there is none — see `personPhotoUrl`. */
  photo_url: string | null;
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
  full_name: person.full_name,
  job_title: employmentPeriod.job_title,
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
      WHEN ou.head_worker_id = ${person.id} THEN parent_ou.head_worker_id
      ELSE ou.head_worker_id
    END
    FROM people.org_unit ou
    LEFT JOIN people.org_unit parent_ou
      ON parent_ou.id = ou.parent_id AND parent_ou.tenant_id = ou.tenant_id
    WHERE ou.id = ${person.org_unit_id} AND ou.tenant_id = ${tenantId}
  )`;
}

function managerNameSql(tenantId: string): SQL<string | null> {
  return sql<string | null>`(
    SELECT mh.full_name FROM people.person mh
      WHERE mh.id = ${derivedManagerIdSql(tenantId)}
        AND mh.tenant_id = ${tenantId} AND mh.deleted_at IS NULL
  )`;
}

function derivedOrgUnitNameSql(tenantId: string): SQL<string | null> {
  return sql<string | null>`(
    SELECT ou.name FROM people.org_unit ou
      WHERE ou.id = ${person.org_unit_id} AND ou.tenant_id = ${tenantId}
  )`;
}

export async function listWorkers(
  session: SessionScope,
  query: ListWorkersQuery = {},
): Promise<{ rows: WorkerRow[]; total: number }> {
  requirePermission(session, 'people.worker.read');

  const tenantId = session.tenant_id;
  const managerName = managerNameSql(tenantId);
  const filters: SQL[] = [tenantScoped(person.tenant_id, session), isNull(person.deleted_at)];

  const ids = query.ids?.filter(Boolean);
  if (ids && ids.length > 0) {
    filters.push(inArray(person.id, ids));
  }

  if (query.search) {
    const like = `%${query.search}%`;
    const term = or(
      ilike(person.full_name, like),
      ilike(person.work_email, like),
      ilike(employmentPeriod.job_title, like),
      sql`EXISTS (
        SELECT 1 FROM people.worker_allocation_projection wap
          LEFT JOIN people.account_projection ap
            ON ap.account_id = wap.account_id AND ap.tenant_id = wap.tenant_id
          WHERE wap.person_id = ${person.id} AND wap.active
            AND wap.tenant_id = ${tenantId}
            AND ap.name ILIKE ${like}
      )`,
      sql`EXISTS (
        SELECT 1 FROM people.person_skill ps
          WHERE ps.person_id = ${person.id}
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
        WHERE wap.person_id = ${person.id} AND wap.active
          AND wap.tenant_id = ${tenantId}
          AND wap.account_id IN (${sql.join(query.account_id, sql`, `)})
    )`);
  }

  if (query.project_id && query.project_id.length > 0) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM people.worker_allocation_projection wap
        WHERE wap.person_id = ${person.id} AND wap.active
          AND wap.tenant_id = ${tenantId}
          AND wap.project_id IN (${sql.join(query.project_id, sql`, `)})
    )`);
  }

  if (query.skill_id && query.skill_id.length > 0) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM people.person_skill ps
        WHERE ps.person_id = ${person.id} AND ps.tenant_id = ${tenantId}
          AND ps.skill_id IN (${sql.join(query.skill_id, sql`, `)})
    )`);
  }

  const where = and(...filters);

  // pm.worker_id / am_worker_id / lead_worker_id all map to people.person_id — shared human identity.
  const accountsAgg = sql<Array<{ id: string; name: string }>>`(
    SELECT coalesce(
      jsonb_agg(DISTINCT jsonb_build_object('id', wap.account_id, 'name', ap.name))
        FILTER (WHERE wap.account_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.worker_allocation_projection wap
    LEFT JOIN people.account_projection ap
      ON ap.account_id = wap.account_id AND ap.tenant_id = wap.tenant_id
    WHERE wap.person_id = ${person.id} AND wap.active AND wap.tenant_id = ${tenantId}
  )`;

  const skillsAgg = sql<Array<{ id: string; name: string; level: number | null }>>`(
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object('id', ps.skill_id, 'name', ps.skill_name, 'level', ps.level)
        ORDER BY ps.skill_name
      ) FILTER (WHERE ps.skill_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.person_skill ps
    WHERE ps.person_id = ${person.id} AND ps.tenant_id = ${tenantId}
  )`;

  // Project names come from the local pm read-model (project_projection), never a cross-schema join.
  const projectsAgg = sql<Array<{ id: string; name: string }>>`(
    SELECT coalesce(
      jsonb_agg(DISTINCT jsonb_build_object('id', wap.project_id, 'name', coalesce(pp.name, '')))
        FILTER (WHERE wap.project_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.worker_allocation_projection wap
    LEFT JOIN people.project_projection pp
      ON pp.project_id = wap.project_id AND pp.tenant_id = wap.tenant_id
    WHERE wap.person_id = ${person.id} AND wap.active AND wap.tenant_id = ${tenantId}
  )`;

  const selection = {
    worker_id: person.id,
    full_name: person.full_name,
    job_title: employmentPeriod.job_title,
    work_email: person.work_email,
    personal_email: person.personal_email,
    phone: person.phone,
    gender: person.gender,
    lifecycle_stage: employmentPeriod.lifecycle_stage,
    onboarding_date: employmentPeriod.start_date,
    offboarding_date: employmentPeriod.end_date,
    manager_name: managerName,
    manager_id: derivedManagerIdSql(tenantId),
    org_unit_id: person.org_unit_id,
    org_unit_name: derivedOrgUnitNameSql(tenantId),
    accounts: accountsAgg,
    projects: projectsAgg,
    skills: skillsAgg,
    employee_no: person.employee_no,
    photo_storage_key: person.photo_storage_key,
  };

  const baseQuery = peopleDb()
    .select(selection)
    .from(person)
    .leftJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, person.id), isNull(employmentPeriod.end_date)),
    )
    .where(where);

  // ids resolve path: return every match, unpaginated (picker chip resolution).
  if (ids && ids.length > 0) {
    const rows = await baseQuery.orderBy(asc(person.full_name));
    return { rows: rows.map(withPhotoUrl) as WorkerRow[], total: rows.length };
  }

  const sortColumn =
    (query.sort && SORT_COLUMNS[query.sort.field as keyof typeof SORT_COLUMNS]) ??
    SORT_COLUMNS.full_name;
  const sortDir = query.sort?.dir === 'desc' ? desc : asc;

  const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(query.page ?? 1, 1);

  const rows = await baseQuery
    .orderBy(sortDir(sortColumn), asc(person.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const countRows = await peopleDb()
    .select({ value: count() })
    .from(person)
    .leftJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, person.id), isNull(employmentPeriod.end_date)),
    )
    .where(where);

  return { rows: rows.map(withPhotoUrl) as WorkerRow[], total: countRows[0]?.value ?? 0 };
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
  employee_no: string | null;
  photo_url: string | null;
}> {
  requirePermission(session, 'people.worker.read');
  const tenantId = session.tenant_id;
  const managerName = managerNameSql(tenantId);
  const orgUnitNameSql = derivedOrgUnitNameSql(tenantId);

  const accountsAgg = sql<Array<{ id: string; name: string }>>`(
    SELECT coalesce(
      jsonb_agg(DISTINCT jsonb_build_object('id', wap.account_id, 'name', ap.name))
        FILTER (WHERE wap.account_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.worker_allocation_projection wap
    LEFT JOIN people.account_projection ap
      ON ap.account_id = wap.account_id AND ap.tenant_id = wap.tenant_id
    WHERE wap.person_id = ${person.id} AND wap.active AND wap.tenant_id = ${tenantId}
  )`;

  const skillsAgg = sql<Array<{ id: string; name: string; level: number | null }>>`(
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object('id', ps.skill_id, 'name', ps.skill_name, 'level', ps.level)
        ORDER BY ps.skill_name
      ) FILTER (WHERE ps.skill_id IS NOT NULL),
      '[]'::jsonb)
    FROM people.person_skill ps
    WHERE ps.person_id = ${person.id} AND ps.tenant_id = ${tenantId}
  )`;

  const scope = await buildWorkerScope(session);
  const [row] = await peopleDb()
    .select({
      worker_id: person.id,
      full_name: sql<string>`coalesce(${person.full_name}, '')`,
      work_email: person.work_email,
      personal_email: person.personal_email,
      cv_storage_key: person.cv_storage_key,
      dob: person.dob,
      gender: person.gender,
      phone: person.phone,
      emergency_contact: person.emergency_contact,
      version: person.version,
      lifecycle_stage: employmentPeriod.lifecycle_stage,
      onboarding_date: employmentPeriod.start_date,
      offboarding_date: employmentPeriod.end_date,
      job_title: employmentPeriod.job_title,
      manager_name: managerName,
      manager_id: derivedManagerIdSql(tenantId),
      org_unit_id: person.org_unit_id,
      org_unit_name: orgUnitNameSql,
      accounts: accountsAgg,
      skills: skillsAgg,
      employee_no: person.employee_no,
      photo_storage_key: person.photo_storage_key,
    })
    .from(person)
    .leftJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, person.id), isNull(employmentPeriod.end_date)),
    )
    .where(
      and(eq(person.id, worker_id), tenantScoped(person.tenant_id, session), scope ?? undefined),
    )
    .limit(1);
  if (!row) throw new PeopleError('NOT_FOUND', 'worker not found');
  return withPhotoUrl(row);
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
  const scope = await buildWorkerScope(session);
  if (scope) {
    const [visible] = await peopleDb()
      .select({ person_id: person.id })
      .from(person)
      .where(and(eq(person.id, worker_id), tenantScoped(person.tenant_id, session), scope))
      .limit(1);
    if (!visible) throw new PeopleError('NOT_FOUND', 'worker not found');
  }
  const rows = await peopleDb()
    .select({
      at: personHistory.at,
      action: personHistory.action,
      field: personHistory.field,
      from_val: personHistory.from_val,
      to_val: personHistory.to_val,
      by_user_id: personHistory.by_user_id,
    })
    .from(personHistory)
    .where(
      and(eq(personHistory.person_id, worker_id), tenantScoped(personHistory.tenant_id, session)),
    )
    .orderBy(desc(personHistory.at));
  return rows;
}
