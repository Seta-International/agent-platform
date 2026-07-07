import { invalidateUserSessions } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { roleAssignments } from '../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';

export async function revokeRole(assignmentId: string, actor: Actor): Promise<void> {
  const [assignment] = await identityDb()
    .select()
    .from(roleAssignments)
    .where(eq(roleAssignments.id, assignmentId))
    .limit(1);
  if (!assignment) throw new IdentityError('GRANT_NOT_FOUND', assignmentId);
  if (assignment.revoked_at) return;

  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.role.grant', assignment.tenant_id);
  }

  await withEmit(
    {
      actor: {
        userId: actor.user_id ?? 'system',
        tenantId: assignment.tenant_id,
        ip: actor.ip,
        userAgent: actor.user_agent,
      },
    },
    async (tx) => {
      await tx
        .update(roleAssignments)
        .set({ revoked_at: new Date(), revoked_by: actor.user_id })
        .where(and(eq(roleAssignments.id, assignmentId), isNull(roleAssignments.revoked_at)));
      await emit({
        tenantId: assignment.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: assignment.user_id,
        eventType: 'identity.role_grant.changed',
        eventVersion: 1,
        payload: {
          actor: {
            type: actor.type,
            user_id: actor.user_id,
            ip: actor.ip,
            user_agent: actor.user_agent,
          },
          user_id: assignment.user_id,
          tenant_id: assignment.tenant_id,
          change: 'revoked',
          grant: {
            grant_id: assignmentId,
            role_slug: assignment.role_slug,
            scope_kind: assignment.scope_kind,
            scope_id: assignment.scope_id,
            granted_via: assignment.granted_via,
          },
        },
      });
    },
  );

  await invalidateUserSessions(assignment.user_id);
}
