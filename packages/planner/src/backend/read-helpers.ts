import type { SessionScope } from '@seta/core';
import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from './db/index.ts';
import { groupMembers, groups } from './db/schema.ts';

export function isTenantAdminish(session: SessionScope): boolean {
  return session.role_summary.roles.some(
    (r) => r === 'org.admin' || r === 'tenant.admin' || r === 'system.integrations.m365',
  );
}

/** Groups this user has planner-local membership in, tenant-bound via the groups join. */
export async function listMemberGroupIds(userId: string, tenantId: string): Promise<string[]> {
  const rows = await plannerDb()
    .select({ group_id: groupMembers.group_id })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.group_id))
    .where(
      and(
        eq(groupMembers.user_id, userId),
        eq(groups.tenant_id, tenantId),
        isNull(groups.deleted_at),
      ),
    );
  return rows.map((r) => r.group_id);
}

export async function groupFilterFor(session: SessionScope): Promise<readonly string[] | null> {
  if (isTenantAdminish(session) || session.role_summary.cross_tenant_read) return null;
  return listMemberGroupIds(session.user_id, session.tenant_id);
}
