import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { roleGrants, user } from '../../db/schema.ts';
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
      role_slug: roleGrants.role_slug,
      scope_type: roleGrants.scope_type,
      scope_id: roleGrants.scope_id,
      granted_at: roleGrants.granted_at,
    })
    .from(roleGrants)
    .where(and(eq(roleGrants.user_id, userId), isNull(roleGrants.revoked_at)));

  return { tenant_id: u.tenant_id, grants };
}
