import { emit, withEmit } from '@seta/core/events';
import { roleGrants } from '../../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';
import { requireUserExists } from './helpers.ts';

export interface GrantRoleInput {
  user_id: string;
  tenant_id: string;
  role_slug: string;
  scope_type: 'tenant' | 'group';
  scope_id: string | null;
}

export async function grantRole(
  input: GrantRoleInput,
  actor: Actor,
): Promise<{ grant_id: string }> {
  await requireUserExists(input.user_id);

  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.role.grant', input.tenant_id);
  }

  const grantId = crypto.randomUUID();
  const grantedVia: 'cli' | 'admin' = actor.type === 'cli' ? 'cli' : 'admin';

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
      await tx.insert(roleGrants).values({
        id: grantId,
        user_id: input.user_id,
        tenant_id: input.tenant_id,
        role_slug: input.role_slug,
        scope_type: input.scope_type,
        scope_id: input.scope_id,
        granted_by: actor.user_id,
        granted_via: grantedVia,
      });
      await emit({
        tenantId: input.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: input.user_id,
        eventType: 'identity.role_grant.changed',
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
          change: 'granted',
          grant: {
            grant_id: grantId,
            role_slug: input.role_slug,
            scope_type: input.scope_type,
            scope_id: input.scope_id,
            granted_via: grantedVia,
          },
        },
      });
    },
  );

  return { grant_id: grantId };
}
