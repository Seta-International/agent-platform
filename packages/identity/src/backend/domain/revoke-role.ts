import { emit, withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { roleGrants } from '../../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';

export async function revokeRole(grantId: string, actor: Actor): Promise<void> {
  const [grant] = await identityDb()
    .select()
    .from(roleGrants)
    .where(eq(roleGrants.id, grantId))
    .limit(1);
  if (!grant) throw new IdentityError('GRANT_NOT_FOUND', grantId);
  if (grant.revoked_at) return;

  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.role.grant', grant.tenant_id);
  }

  await withEmit(
    {
      actor: {
        userId: actor.user_id ?? 'system',
        tenantId: grant.tenant_id,
        ip: actor.ip,
        userAgent: actor.user_agent,
      },
    },
    async (tx) => {
      await tx
        .update(roleGrants)
        .set({ revoked_at: new Date(), revoked_by: actor.user_id })
        .where(and(eq(roleGrants.id, grantId), isNull(roleGrants.revoked_at)));
      await emit({
        tenantId: grant.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: grant.user_id,
        eventType: 'identity.role_grant.changed',
        eventVersion: 1,
        payload: {
          actor: {
            type: actor.type,
            user_id: actor.user_id,
            ip: actor.ip,
            user_agent: actor.user_agent,
          },
          user_id: grant.user_id,
          tenant_id: grant.tenant_id,
          change: 'revoked',
          grant: {
            grant_id: grantId,
            role_slug: grant.role_slug,
            scope_type: grant.scope_type,
            scope_id: grant.scope_id,
            granted_via: grant.granted_via,
          },
        },
      });
    },
  );
}
