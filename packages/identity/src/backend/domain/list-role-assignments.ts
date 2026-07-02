import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import {
  accessGroup,
  accessGroupMembership,
  accessGroupRole,
  roleAssignments,
  user,
} from '../db/schema.ts';
import { IdentityError } from '../rbac.ts';
import type { EffectiveAssignment } from './resolve-effective-assignments.ts';

export interface ActiveAssignment extends EffectiveAssignment {
  granted_at: Date;
}

const key = (a: EffectiveAssignment): string =>
  `${a.role_slug}|${a.scope_kind}|${a.scope_id ?? ''}`;

export async function listRoleAssignments(
  userId: string,
): Promise<{ tenant_id: string; assignments: ReadonlyArray<ActiveAssignment> }> {
  const db = identityDb();
  const [u] = await db
    .select({ tenant_id: user.tenant_id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!u) throw new IdentityError('USER_NOT_FOUND', `No user with id ${userId}`);

  const direct = await db
    .select({
      role_slug: roleAssignments.role_slug,
      scope_kind: roleAssignments.scope_kind,
      scope_id: roleAssignments.scope_id,
      granted_at: roleAssignments.granted_at,
    })
    .from(roleAssignments)
    .where(and(eq(roleAssignments.user_id, userId), isNull(roleAssignments.revoked_at)));

  const viaGroups = await db
    .select({
      role_slug: accessGroupRole.role_slug,
      scope_kind: accessGroupRole.scope_kind,
      scope_id: accessGroupRole.scope_id,
    })
    .from(accessGroupMembership)
    .innerJoin(accessGroup, eq(accessGroup.id, accessGroupMembership.group_id))
    .innerJoin(accessGroupRole, eq(accessGroupRole.group_id, accessGroup.id))
    .where(and(eq(accessGroupMembership.user_id, userId), eq(accessGroup.tenant_id, u.tenant_id)));

  const directKeys = new Set(direct.map(key));
  const synthetic = viaGroups
    .filter((g) => !directKeys.has(key(g)))
    .map((g) => ({ ...g, granted_at: new Date(0) }));

  return { tenant_id: u.tenant_id, assignments: [...direct, ...synthetic] };
}

export async function listUserGroupIds(userId: string): Promise<string[]> {
  const rows = await identityDb()
    .select({ group_id: accessGroupMembership.group_id })
    .from(accessGroupMembership)
    .where(eq(accessGroupMembership.user_id, userId));
  return rows.map((r) => r.group_id);
}
