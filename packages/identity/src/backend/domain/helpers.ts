// rbac: delegates — internal lookup helper used inside other domain functions that own
// the rbac check. Not a request entry point.
import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { orgUnitProjection, user } from '../db/schema.ts';
import { IdentityError } from '../rbac.ts';

export async function requireUserExists(
  userId: string,
): Promise<{ tenant_id: string; email: string; name: string; deactivated_at: Date | null }> {
  const [u] = await identityDb()
    .select({
      tenant_id: user.tenant_id,
      email: user.email,
      name: user.name,
      deactivated_at: user.deactivated_at,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!u) throw new IdentityError('USER_NOT_FOUND', `No user with id ${userId}`);
  return u;
}

export async function requireOrgUnitInTenant(tenantId: string, orgUnitId: string): Promise<void> {
  const [row] = await identityDb()
    .select({ id: orgUnitProjection.org_unit_id })
    .from(orgUnitProjection)
    .where(
      and(
        eq(orgUnitProjection.org_unit_id, orgUnitId),
        eq(orgUnitProjection.tenant_id, tenantId),
        isNull(orgUnitProjection.deleted_at),
      ),
    )
    .limit(1);
  if (!row) throw new IdentityError('unknown_org_unit', `Unknown org unit ${orgUnitId}`);
}
