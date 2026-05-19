import { emit, withEmit } from '@seta/core/events';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { roleGrants, user } from '../../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';
import { requireUserExists } from './helpers.ts';

export async function deactivateUser(userId: string, actor: Actor): Promise<void> {
  const target = await requireUserExists(userId);
  if (target.deactivated_at) return;

  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.user.write', target.tenant_id);
  }

  const adminCountRows = await identityDb()
    .select({
      active_admins: sql<number>`count(distinct ${roleGrants.user_id})::int`,
    })
    .from(roleGrants)
    .innerJoin(user, eq(user.id, roleGrants.user_id))
    .where(
      and(
        eq(roleGrants.tenant_id, target.tenant_id),
        eq(roleGrants.role_slug, 'org.admin'),
        isNull(roleGrants.revoked_at),
        isNull(user.deactivated_at),
      ),
    );
  const active_admins = adminCountRows[0]?.active_admins ?? 0;

  const [adminCheck] = await identityDb()
    .select({ has: sql<boolean>`true` })
    .from(roleGrants)
    .where(
      and(
        eq(roleGrants.user_id, userId),
        eq(roleGrants.role_slug, 'org.admin'),
        isNull(roleGrants.revoked_at),
      ),
    )
    .limit(1);

  if (adminCheck && active_admins <= 1) {
    throw new IdentityError('LAST_ORG_ADMIN');
  }

  const deactivatedAt = new Date();
  await withEmit(
    {
      actor: {
        userId: actor.user_id ?? 'system',
        tenantId: target.tenant_id,
        ip: actor.ip,
        userAgent: actor.user_agent,
      },
    },
    async (tx) => {
      await tx
        .update(user)
        .set({ deactivated_at: deactivatedAt, updated_at: new Date() })
        .where(eq(user.id, userId));
      await emit({
        tenantId: target.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: userId,
        eventType: 'identity.user.deactivated',
        eventVersion: 1,
        payload: {
          actor: {
            type: actor.type,
            user_id: actor.user_id,
            ip: actor.ip,
            user_agent: actor.user_agent,
          },
          user_id: userId,
          tenant_id: target.tenant_id,
          deactivated_at: deactivatedAt.toISOString(),
        },
      });
    },
  );
}
