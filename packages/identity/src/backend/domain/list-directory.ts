import type { SessionScope } from '@seta/core';
import { and, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import {
  accessGroup,
  accessGroupMembership,
  directoryPerson,
  roleAssignments,
  user,
} from '../db/schema.ts';
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
  await requirePermission(session.user_id, 'identity.user.list', session.tenant_id);

  const page = Math.max(opts.page ?? 0, 0);
  const pageSize = Math.min(Math.max(opts.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  const searchFilter = opts.search
    ? or(
        ilike(directoryPerson.full_name, `%${opts.search}%`),
        ilike(directoryPerson.work_email, `%${opts.search}%`),
      )
    : undefined;

  const statusFilter =
    opts.status === 'none'
      ? isNull(user.id)
      : opts.status === 'active'
        ? and(isNotNull(user.id), isNull(user.deactivated_at))
        : opts.status === 'suspended'
          ? and(isNotNull(user.id), isNotNull(user.deactivated_at))
          : undefined;

  const employmentFilter = opts.employment
    ? eq(directoryPerson.employment_status, opts.employment)
    : undefined;

  // Membership keys on user_id, so a group filter implicitly excludes account-less people.
  const groupFilter = opts.group_id
    ? inArray(
        user.id,
        identityDb()
          .select({ id: accessGroupMembership.user_id })
          .from(accessGroupMembership)
          .where(eq(accessGroupMembership.group_id, opts.group_id)),
      )
    : undefined;

  // Shared join + filter, reused by the page query and the total-count query so they stay in sync.
  const userJoin = and(
    eq(user.tenant_id, directoryPerson.tenant_id),
    sql`lower(${user.email}) = lower(${directoryPerson.work_email})`,
  );
  const whereClause = and(
    eq(directoryPerson.tenant_id, session.tenant_id),
    searchFilter,
    statusFilter,
    employmentFilter,
    groupFilter,
  );

  const [base, totalRows] = await Promise.all([
    identityDb()
      .select({
        person_id: directoryPerson.person_id,
        full_name: directoryPerson.full_name,
        work_email: directoryPerson.work_email,
        job_title: directoryPerson.job_title,
        employment_status: directoryPerson.employment_status,
        user_id: user.id,
        deactivated_at: user.deactivated_at,
      })
      .from(directoryPerson)
      .leftJoin(user, userJoin)
      .where(whereClause)
      .orderBy(directoryPerson.full_name)
      .limit(pageSize + 1)
      .offset(page * pageSize),
    identityDb()
      .select({ total: sql<number>`count(*)::int` })
      .from(directoryPerson)
      .leftJoin(user, userJoin)
      .where(whereClause),
  ]);
  const total = totalRows[0]?.total ?? 0;

  const userIds = base.map((r) => r.user_id).filter((x): x is string => x !== null);

  const grants =
    userIds.length > 0
      ? await identityDb()
          .select({ user_id: roleAssignments.user_id, role_slug: roleAssignments.role_slug })
          .from(roleAssignments)
          .where(and(isNull(roleAssignments.revoked_at), inArray(roleAssignments.user_id, userIds)))
      : [];

  const rolesByUser = new Map<string, string[]>();
  for (const g of grants) {
    const existing = rolesByUser.get(g.user_id) ?? [];
    existing.push(g.role_slug);
    rolesByUser.set(g.user_id, existing);
  }

  const memberships =
    userIds.length > 0
      ? await identityDb()
          .select({ user_id: accessGroupMembership.user_id, name: accessGroup.name })
          .from(accessGroupMembership)
          .innerJoin(accessGroup, eq(accessGroup.id, accessGroupMembership.group_id))
          .where(
            and(
              eq(accessGroup.tenant_id, session.tenant_id),
              inArray(accessGroupMembership.user_id, userIds),
            ),
          )
          .orderBy(accessGroup.name)
      : [];

  const groupsByUser = new Map<string, string[]>();
  for (const m of memberships) {
    const existing = groupsByUser.get(m.user_id) ?? [];
    existing.push(m.name);
    groupsByUser.set(m.user_id, existing);
  }

  const rows: DirectoryRow[] = base.slice(0, pageSize).map((r) => ({
    person_id: r.person_id,
    full_name: r.full_name,
    work_email: r.work_email,
    job_title: r.job_title,
    employment_status: r.employment_status as DirectoryRow['employment_status'],
    user_id: r.user_id ?? null,
    account_status: !r.user_id ? 'none' : r.deactivated_at ? 'suspended' : ('active' as const),
    roles: r.user_id ? (rolesByUser.get(r.user_id) ?? []) : [],
    groups: r.user_id ? (groupsByUser.get(r.user_id) ?? []) : [],
  }));

  return { rows, page, pageSize, hasMore: base.length > pageSize, total };
}
