import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { roleGrants } from '../db/schema.ts';

/** User ids holding an active org.admin grant in a tenant — billing alert recipients. */
export async function listTenantAdminUserIds(tenantId: string): Promise<string[]> {
  const rows = await identityDb()
    .selectDistinct({ userId: roleGrants.user_id })
    .from(roleGrants)
    .where(
      and(
        eq(roleGrants.tenant_id, tenantId),
        eq(roleGrants.role_slug, 'org.admin'),
        isNull(roleGrants.revoked_at),
      ),
    );
  return rows.map((r) => r.userId);
}
