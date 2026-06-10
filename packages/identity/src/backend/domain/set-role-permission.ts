import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { buildRegistry, can, EDITABLE_ROLES, inventoryToManifests } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import { rolePermissionOverlays } from '../db/schema.ts';
import { IdentityError } from '../rbac.ts';

const registry = buildRegistry(inventoryToManifests());

export interface SetRolePermissionInput {
  role_slug: string;
  permission_key: string;
  enabled: boolean;
}

export async function setRolePermission(
  session: SessionScope,
  input: SetRolePermissionInput,
): Promise<void> {
  if (!can(session, 'identity.role.write'))
    throw new IdentityError('FORBIDDEN', 'identity.role.write required');
  if (!EDITABLE_ROLES.includes(input.role_slug))
    throw new IdentityError('VALIDATION', 'role not editable');
  if (!registry.allPermissions.has(input.permission_key))
    throw new IdentityError('VALIDATION', 'unknown permission');

  const seed = new Set(registry.rolePermissions.get(input.role_slug) ?? []);
  const isSeed = seed.has(input.permission_key);

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      if (input.enabled === isSeed) {
        await tx
          .delete(rolePermissionOverlays)
          .where(
            and(
              eq(rolePermissionOverlays.tenant_id, session.tenant_id),
              eq(rolePermissionOverlays.role_slug, input.role_slug),
              eq(rolePermissionOverlays.permission_key, input.permission_key),
            ),
          );
      } else {
        const effect = input.enabled ? 'grant' : 'revoke';
        await tx
          .insert(rolePermissionOverlays)
          .values({
            tenant_id: session.tenant_id,
            role_slug: input.role_slug,
            permission_key: input.permission_key,
            effect,
            updated_by: session.user_id,
          })
          .onConflictDoUpdate({
            target: [
              rolePermissionOverlays.tenant_id,
              rolePermissionOverlays.role_slug,
              rolePermissionOverlays.permission_key,
            ],
            set: { effect, updated_by: session.user_id, updated_at: new Date() },
          });
      }
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
