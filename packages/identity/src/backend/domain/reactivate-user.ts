import { emit, withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { user } from '../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';
import { requireUserExists } from './helpers.ts';

export async function reactivateUser(userId: string, actor: Actor): Promise<void> {
  const target = await requireUserExists(userId);
  if (!target.deactivated_at) return;

  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.user.update', target.tenant_id);
  }

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
        .set({ deactivated_at: null, updated_at: new Date() })
        .where(eq(user.id, userId));
      await emit({
        tenantId: target.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: userId,
        eventType: 'identity.user.reactivated',
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
        },
      });
    },
  );
}
