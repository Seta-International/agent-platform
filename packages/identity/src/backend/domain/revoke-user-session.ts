import { emit, withEmit } from '@seta/core/events';
import { and, eq, sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { session } from '../../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';

export interface RevokeUserSessionInput {
  tenant_id: string;
  user_id: string;
  session_id: string;
  current_session_id: string | null;
}

export async function revokeUserSession(
  input: RevokeUserSessionInput,
  actor: Actor,
): Promise<void> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.user.write', input.tenant_id);
  }
  if (input.current_session_id && input.current_session_id === input.session_id) {
    throw new IdentityError('SELF_SESSION', 'Cannot revoke your own session here');
  }

  const tenantProbe = await identityDb().execute(sql`
    SELECT 1 FROM identity."user" WHERE id = ${input.user_id} AND tenant_id = ${input.tenant_id}
  `);
  if (tenantProbe.rows.length === 0) {
    throw new IdentityError('NOT_FOUND', 'User not found in tenant');
  }

  await withEmit(
    {
      actor: {
        userId: actor.user_id ?? 'system',
        tenantId: input.tenant_id,
        ip: actor.ip,
        userAgent: actor.user_agent,
      },
    },
    async (tx) => {
      const deleted = await tx
        .delete(session)
        .where(and(eq(session.id, input.session_id), eq(session.user_id, input.user_id)))
        .returning({ id: session.id });
      if (deleted.length === 0) {
        throw new IdentityError('NOT_FOUND', 'Session not found');
      }
      await emit({
        tenantId: input.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: input.user_id,
        eventType: 'identity.session.revoked',
        eventVersion: 1,
        payload: {
          actor: {
            type: actor.type,
            user_id: actor.user_id,
            ip: actor.ip,
            user_agent: actor.user_agent,
          },
          user_id: input.user_id,
          tenant_id: input.tenant_id,
          session_id: input.session_id,
        },
      });
    },
  );
}
