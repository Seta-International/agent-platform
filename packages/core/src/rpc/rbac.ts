import { hasPermission } from '@seta/shared-rbac';
import type { ModuleKey } from '@seta/shared-types';
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

export function rbacCheck(
  actor: RpcActor,
  permission: string,
  module: ModuleKey,
  method: string,
): void {
  const allowed = hasPermission(
    { roles: actor.role_summary.roles, cross_tenant_read: actor.cross_tenant_read },
    permission,
  );
  if (!allowed) throw new RpcForbidden(module, method, permission);
}
