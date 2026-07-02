import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import {
  accessGroup,
  accessGroupMembership,
  accessGroupRole,
  roleAssignments,
} from '../db/schema.ts';

export async function resolveEffectiveRoleSlugs(
  userId: string,
  tenantId: string,
): Promise<string[]> {
  const db = identityDb();

  const direct = await db
    .select({ role_slug: roleAssignments.role_slug })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.user_id, userId),
        eq(roleAssignments.tenant_id, tenantId),
        isNull(roleAssignments.revoked_at),
      ),
    );

  const viaGroups = await db
    .select({ role_slug: accessGroupRole.role_slug })
    .from(accessGroupMembership)
    .innerJoin(accessGroup, eq(accessGroup.id, accessGroupMembership.group_id))
    .innerJoin(accessGroupRole, eq(accessGroupRole.group_id, accessGroup.id))
    .where(and(eq(accessGroupMembership.user_id, userId), eq(accessGroup.tenant_id, tenantId)));

  const set = new Set<string>();
  for (const r of direct) set.add(r.role_slug);
  for (const r of viaGroups) set.add(r.role_slug);
  return Array.from(set).sort();
}
