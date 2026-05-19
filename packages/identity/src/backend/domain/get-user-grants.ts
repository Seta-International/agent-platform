import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { roleGrants } from '../../db/schema.ts';

export interface UserGrant {
  id: string;
  role_slug: string;
  scope_type: 'tenant' | 'group';
  scope_id: string | null;
  granted_via: 'admin' | 'cli' | 'idp';
  granted_at: Date;
}

export async function getUserGrants(userId: string): Promise<UserGrant[]> {
  const db = identityDb();
  const rows = await db
    .select({
      id: roleGrants.id,
      role_slug: roleGrants.role_slug,
      scope_type: roleGrants.scope_type,
      scope_id: roleGrants.scope_id,
      granted_via: roleGrants.granted_via,
      granted_at: roleGrants.granted_at,
    })
    .from(roleGrants)
    .where(and(eq(roleGrants.user_id, userId), isNull(roleGrants.revoked_at)))
    .orderBy(roleGrants.granted_at);

  return rows as UserGrant[];
}
