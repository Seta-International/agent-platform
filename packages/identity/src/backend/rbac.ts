import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from './db/index.ts';
import { roleGrants } from './db/schema.ts';
import { resolveForRoles } from './rbac-registry.ts';

export class IdentityError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'IdentityError';
  }
}

export async function requirePermission(
  userId: string,
  permission: string,
  tenantId: string,
): Promise<void> {
  const grants = await identityDb()
    .select({ role_slug: roleGrants.role_slug })
    .from(roleGrants)
    .where(
      and(
        eq(roleGrants.user_id, userId),
        eq(roleGrants.tenant_id, tenantId),
        isNull(roleGrants.revoked_at),
      ),
    );

  const perms = resolveForRoles(grants.map((g) => g.role_slug));
  if (!perms.has(permission)) {
    throw new IdentityError('FORBIDDEN', `Missing permission: ${permission}`);
  }
}
