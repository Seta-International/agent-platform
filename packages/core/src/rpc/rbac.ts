import { type RbacRegistry, type RoleOverlay, resolvePermissions } from '@seta/shared-rbac';
import { z } from 'zod';
import { RpcForbidden } from './errors.ts';

export const RpcActorSchema = z.object({
  user_id: z.string().min(1),
  tenant_id: z.string().min(1),
  email: z.string().email().or(z.string().min(1)),
  display_name: z.string(),
  role_summary: z.object({
    roles: z.array(z.string()),
    cross_tenant_read: z.boolean(),
    assignments: z
      .array(
        z.object({
          role_slug: z.string(),
          scope_kind: z.enum(['tenant', 'org_unit', 'self', 'group']),
          scope_id: z.string().nullable(),
        }),
      )
      .default([]),
  }),
  cross_tenant_read: z.boolean(),
});

export type RpcActor = z.infer<typeof RpcActorSchema>;

export type RbacCheck = (
  actor: RpcActor,
  permission: string,
  module: string,
  method: string,
) => Promise<void>;

export function makeRbacCheck(
  registry: RbacRegistry,
  implicit: readonly string[],
  getOverlay?: (tenantId: string) => Promise<RoleOverlay | undefined>,
): RbacCheck {
  return async (actor, permission, module, method): Promise<void> => {
    const overlay = getOverlay ? await getOverlay(actor.tenant_id) : undefined;
    const perms = resolvePermissions(registry, actor.role_summary.roles, implicit, overlay);
    if (!perms.has(permission)) throw new RpcForbidden(module, method, permission);
  };
}

let configured: RbacCheck | null = null;

/** Wire the resolved-registry check at the composition root (apps/server build). */
export function setRbacCheck(check: RbacCheck): void {
  configured = check;
}

export async function rbacCheck(
  actor: RpcActor,
  permission: string,
  module: string,
  method: string,
): Promise<void> {
  if (!configured) {
    throw new Error(
      'rbacCheck not configured: call setRbacCheck(makeRbacCheck(registry, IMPLICIT_PERMISSIONS)) at boot',
    );
  }
  await configured(actor, permission, module, method);
}
