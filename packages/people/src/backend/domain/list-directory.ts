import type { SessionScope } from '@seta/core';
import { listGroupMembers, listGroupNamesForUsers, listRolesForUsers } from '@seta/identity';
import { and, eq, ilike, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { PeoplePermission } from '../../rbac.ts';
import { peopleDb } from '../db/client.ts';
import { employmentPeriod, person, userProjection, worker } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

export interface DirectoryRow {
  person_id: string;
  full_name: string;
  work_email: string | null;
  job_title: string | null;
  employment_status: 'active' | 'terminated';
  account_status: 'none' | 'active' | 'suspended';
  user_id: string | null;
  roles: string[];
  groups: string[];
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function listDirectory(
  session: SessionScope,
  opts: {
    search?: string;
    status?: DirectoryRow['account_status'];
    employment?: DirectoryRow['employment_status'];
    group_id?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{
  rows: DirectoryRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  total: number;
}> {
  // identity.user.list is identity-owned but permission strings are checked globally
  // (session.permissions), so people can gate this directory read on it; PeoplePermission
  // just doesn't type it as "ours" (mirrors provisionAccount's identity.user.update cast).
  requirePermission(session, 'identity.user.list' as PeoplePermission);

  const page = Math.max(opts.page ?? 0, 0);
  const pageSize = Math.min(Math.max(opts.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  // FROM person LEFT JOIN worker: every person in this system has a worker row (they're
  // created together), but base on the person set so a person without one still surfaces
  // (with blanked display fields) instead of silently vanishing.
  const fullName = sql<string>`coalesce(${worker.full_name}, '')`;

  const searchFilter = opts.search
    ? or(ilike(worker.full_name, `%${opts.search}%`), ilike(worker.work_email, `%${opts.search}%`))
    : undefined;

  const statusFilter =
    opts.status === 'none'
      ? isNull(userProjection.user_id)
      : opts.status === 'active'
        ? and(isNotNull(userProjection.user_id), isNull(userProjection.deactivated_at))
        : opts.status === 'suspended'
          ? and(isNotNull(userProjection.user_id), isNotNull(userProjection.deactivated_at))
          : undefined;

  // employment_period_one_open guarantees at most one open row per person, so this join
  // never fans out. An open period (end_date IS NULL) means active; none means terminated.
  const employmentFilter = opts.employment
    ? opts.employment === 'active'
      ? isNotNull(employmentPeriod.id)
      : isNull(employmentPeriod.id)
    : undefined;

  // Membership keys on user_id, so a group filter implicitly excludes account-less people.
  let groupFilter: SQL | undefined;
  if (opts.group_id) {
    const members = await listGroupMembers(session, opts.group_id);
    const memberIds = members.map((m) => m.user_id);
    groupFilter = memberIds.length > 0 ? inArray(userProjection.user_id, memberIds) : sql`false`;
  }

  const whereClause = and(
    eq(person.tenant_id, session.tenant_id),
    isNull(worker.deleted_at),
    searchFilter,
    statusFilter,
    employmentFilter,
    groupFilter,
  );

  const selection = {
    person_id: person.id,
    full_name: fullName,
    work_email: worker.work_email,
    job_title: worker.job_title,
    employment_status: sql<
      'active' | 'terminated'
    >`CASE WHEN ${employmentPeriod.id} IS NOT NULL THEN 'active' ELSE 'terminated' END`,
    user_id: userProjection.user_id,
    deactivated_at: userProjection.deactivated_at,
  };

  const fromQuery = () =>
    peopleDb()
      .select(selection)
      .from(person)
      .leftJoin(worker, eq(worker.person_id, person.id))
      .leftJoin(
        employmentPeriod,
        and(eq(employmentPeriod.person_id, person.id), isNull(employmentPeriod.end_date)),
      )
      .leftJoin(userProjection, eq(userProjection.person_id, person.id));

  const [base, totalRows] = await Promise.all([
    fromQuery()
      .where(whereClause)
      .orderBy(fullName)
      .limit(pageSize + 1)
      .offset(page * pageSize),
    peopleDb()
      .select({ total: sql<number>`count(*)::int` })
      .from(person)
      .leftJoin(worker, eq(worker.person_id, person.id))
      .leftJoin(
        employmentPeriod,
        and(eq(employmentPeriod.person_id, person.id), isNull(employmentPeriod.end_date)),
      )
      .leftJoin(userProjection, eq(userProjection.person_id, person.id))
      .where(whereClause),
  ]);
  const total = totalRows[0]?.total ?? 0;

  const userIds = base.map((r) => r.user_id).filter((x): x is string => x !== null);

  const [rolesByUser, groupsByUser] = await Promise.all([
    listRolesForUsers(session, userIds),
    listGroupNamesForUsers(session, userIds),
  ]);

  const rows: DirectoryRow[] = base.slice(0, pageSize).map((r) => ({
    person_id: r.person_id,
    full_name: r.full_name,
    work_email: r.work_email,
    job_title: r.job_title,
    employment_status: r.employment_status,
    user_id: r.user_id ?? null,
    account_status: !r.user_id ? 'none' : r.deactivated_at ? 'suspended' : ('active' as const),
    roles: r.user_id ? (rolesByUser.get(r.user_id) ?? []) : [],
    groups: r.user_id ? (groupsByUser.get(r.user_id) ?? []) : [],
  }));

  return { rows, page, pageSize, hasMore: base.length > pageSize, total };
}
