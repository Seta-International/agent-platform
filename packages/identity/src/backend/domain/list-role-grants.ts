import { and, eq, isNull, sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import {
  accessGroup,
  accessGroupMembership,
  accessGroupRole,
  roleAssignments,
  user,
} from '../db/schema.ts';
import { IdentityError } from '../rbac.ts';

export interface ActiveRoleGrant {
  role_slug: string;
  scope_type: 'tenant' | 'group';
  scope_id: string | null;
  granted_at: Date;
}

export interface RoleGrantsResult {
  tenant_id: string;
  grants: ReadonlyArray<ActiveRoleGrant>;
}

export async function listRoleGrants(userId: string): Promise<RoleGrantsResult> {
  const db = identityDb();
  const [u] = await db
    .select({ tenant_id: user.tenant_id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!u) throw new IdentityError('USER_NOT_FOUND', `No user with id ${userId}`);

  const grants = await db
    .select({
      role_slug: roleAssignments.role_slug,
      // PR1 writers only ever set 'tenant' | 'group' (org_unit/self land in Task 4+); cast narrows
      // to keep this function's public contract (ActiveRoleGrant, ListRoleGrants) unchanged here.
      scope_type: sql<'tenant' | 'group'>`${roleAssignments.scope_kind}`,
      scope_id: roleAssignments.scope_id,
      granted_at: roleAssignments.granted_at,
    })
    .from(roleAssignments)
    .where(and(eq(roleAssignments.user_id, userId), isNull(roleAssignments.revoked_at)));

  const groupRoles = await db
    .select({ role_slug: accessGroupRole.role_slug })
    .from(accessGroupMembership)
    .innerJoin(accessGroup, eq(accessGroup.id, accessGroupMembership.group_id))
    .innerJoin(accessGroupRole, eq(accessGroupRole.group_id, accessGroup.id))
    .where(and(eq(accessGroupMembership.user_id, userId), eq(accessGroup.tenant_id, u.tenant_id)));

  const directSlugs = new Set(grants.map((g) => g.role_slug));
  const synthetic = groupRoles
    .filter((g) => !directSlugs.has(g.role_slug))
    .map((g) => ({
      role_slug: g.role_slug,
      scope_type: 'tenant' as const,
      scope_id: null,
      granted_at: new Date(0),
    }));

  return { tenant_id: u.tenant_id, grants: [...grants, ...synthetic] };
}

export async function listUserGroupIds(userId: string): Promise<string[]> {
  const rows = await identityDb()
    .select({ group_id: accessGroupMembership.group_id })
    .from(accessGroupMembership)
    .where(eq(accessGroupMembership.user_id, userId));
  return rows.map((r) => r.group_id);
}
