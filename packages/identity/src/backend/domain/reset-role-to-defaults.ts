import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { can, EDITABLE_ROLES } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import { rolePermissionOverlays } from '../db/schema.ts';
import { IdentityError } from '../rbac.ts';

export interface ResetRoleToDefaultsInput {
  role_slug: string;
}

export async function resetRoleToDefaults(
  session: SessionScope,
  input: ResetRoleToDefaultsInput,
): Promise<void> {
  if (!can(session, 'identity.role.write'))
    throw new IdentityError('FORBIDDEN', 'identity.role.write required');
  if (!EDITABLE_ROLES.includes(input.role_slug))
    throw new IdentityError('VALIDATION', 'role not editable');

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      await tx
        .delete(rolePermissionOverlays)
        .where(
          and(
            eq(rolePermissionOverlays.tenant_id, session.tenant_id),
            eq(rolePermissionOverlays.role_slug, input.role_slug),
          ),
        );
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'identity.tenant',
        aggregateId: session.tenant_id,
        eventType: 'identity.role_permissions.changed',
        eventVersion: 1,
        payload: {
          actor: { type: 'user', user_id: session.user_id },
          tenant_id: session.tenant_id,
          role_slug: input.role_slug,
        },
      });
    },
  );
}
