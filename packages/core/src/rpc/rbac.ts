import { type RbacRegistry, resolvePermissions } from '@seta/shared-rbac';
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
  }),
  cross_tenant_read: z.boolean(),
});

export type RpcActor = z.infer<typeof RpcActorSchema>;

export type RbacCheck = (
  actor: RpcActor,
  permission: string,
  module: string,
  method: string,
) => void;

export function makeRbacCheck(registry: RbacRegistry, implicit: readonly string[]): RbacCheck {
  return (actor, permission, module, method): void => {
    const perms = resolvePermissions(registry, actor.role_summary.roles, implicit);
    if (!perms.has(permission)) throw new RpcForbidden(module, method, permission);
  };
}

let configured: RbacCheck | null = null;

/** Wire the resolved-registry check at the composition root (apps/server build). */
export function setRbacCheck(check: RbacCheck): void {
  configured = check;
}

export function rbacCheck(
  actor: RpcActor,
  permission: string,
  module: string,
  method: string,
): void {
  if (!configured) {
    throw new Error(
      'rbacCheck not configured: call setRbacCheck(makeRbacCheck(registry, IMPLICIT_PERMISSIONS)) at boot',
    );
  }
  configured(actor, permission, module, method);
}
