import type { SessionScope } from '@seta/core';
import { and, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { directoryPerson, roleGrants, user } from '../db/schema.ts';
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
}

const PAGE = 50;

export async function listDirectory(
  session: SessionScope,
  opts: { search?: string; status?: DirectoryRow['account_status']; page?: number } = {},
): Promise<{ rows: DirectoryRow[]; page: number; hasMore: boolean }> {
  await requirePermission(session.user_id, 'identity.user.read.any', session.tenant_id);

  const page = opts.page ?? 0;

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

  const base = await identityDb()
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
    .leftJoin(
      user,
      and(
        eq(user.tenant_id, directoryPerson.tenant_id),
        sql`lower(${user.email}) = lower(${directoryPerson.work_email})`,
      ),
    )
    .where(and(eq(directoryPerson.tenant_id, session.tenant_id), searchFilter, statusFilter))
    .orderBy(directoryPerson.full_name)
    .limit(PAGE + 1)
    .offset(page * PAGE);

  const userIds = base.map((r) => r.user_id).filter((x): x is string => x !== null);

  const grants =
    userIds.length > 0
      ? await identityDb()
          .select({ user_id: roleGrants.user_id, role_slug: roleGrants.role_slug })
          .from(roleGrants)
          .where(and(isNull(roleGrants.revoked_at), inArray(roleGrants.user_id, userIds)))
      : [];

  const rolesByUser = new Map<string, string[]>();
  for (const g of grants) {
    const existing = rolesByUser.get(g.user_id) ?? [];
    existing.push(g.role_slug);
    rolesByUser.set(g.user_id, existing);
  }

  const rows: DirectoryRow[] = base.slice(0, PAGE).map((r) => ({
    person_id: r.person_id,
    full_name: r.full_name,
    work_email: r.work_email,
    job_title: r.job_title,
    employment_status: r.employment_status as DirectoryRow['employment_status'],
    user_id: r.user_id ?? null,
    account_status: !r.user_id ? 'none' : r.deactivated_at ? 'suspended' : ('active' as const),
    roles: r.user_id ? (rolesByUser.get(r.user_id) ?? []) : [],
  }));

  return { rows, page, hasMore: base.length > PAGE };
}
