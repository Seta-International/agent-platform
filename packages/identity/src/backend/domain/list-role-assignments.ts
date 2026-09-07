import type { SessionScope } from '@seta/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
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
import { scopeIdFromDb } from './scope-id.ts';

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

  const viaGroupsMapped = viaGroups.map((g) => ({ ...g, scope_id: scopeIdFromDb(g.scope_id) }));
  const directKeys = new Set(direct.map(key));
  const synthetic = viaGroupsMapped
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

/**
 * Batch role-slug lookup for a set of users in one tenant — API composition for callers
 * (e.g. the People directory) that need role summaries for a page of users without
 * looping single-user calls or joining across schemas.
 */
/**
 * Reverse lookup: find all user IDs that hold any of the given role slugs in a tenant.
 * Merges direct grants and group-based grants, returns deduplicated user_id[].
 */
export async function listUserIdsByRoleSlugs(
  tenantId: string,
  roleSlugs: string[],
): Promise<string[]> {
  if (roleSlugs.length === 0) return [];
  const db = identityDb();

  const direct = await db
    .select({ user_id: roleAssignments.user_id })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.tenant_id, tenantId),
        inArray(roleAssignments.role_slug, roleSlugs),
        isNull(roleAssignments.revoked_at),
      ),
    );

  const viaGroups = await db
    .select({ user_id: accessGroupMembership.user_id })
    .from(accessGroupRole)
    .innerJoin(accessGroup, eq(accessGroup.id, accessGroupRole.group_id))
    .innerJoin(accessGroupMembership, eq(accessGroupMembership.group_id, accessGroup.id))
    .where(and(eq(accessGroup.tenant_id, tenantId), inArray(accessGroupRole.role_slug, roleSlugs)));

  const ids = new Set([...direct.map((r) => r.user_id), ...viaGroups.map((r) => r.user_id)]);
  return [...ids];
}

export async function listRolesForUsers(
  session: SessionScope,
  userIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;
  const rows = await identityDb()
    .select({ user_id: roleAssignments.user_id, role_slug: roleAssignments.role_slug })
    .from(roleAssignments)
    .innerJoin(user, eq(user.id, roleAssignments.user_id))
    .where(
      and(
        eq(user.tenant_id, session.tenant_id),
        isNull(roleAssignments.revoked_at),
        inArray(roleAssignments.user_id, userIds),
      ),
    );
  for (const r of rows) {
    const existing = map.get(r.user_id) ?? [];
    existing.push(r.role_slug);
    map.set(r.user_id, existing);
  }
  return map;
}
