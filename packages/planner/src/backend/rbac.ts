import { listRoleGrants } from '@seta/identity';
import {
  PLANNER_ROLE_PERMISSIONS,
  type PlannerPermission,
  type PlannerRoleSlug,
} from '../roles.ts';

export type PlannerErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_INPUT'
  | 'INTERNAL';

export class PlannerError extends Error {
  constructor(
    public code: PlannerErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PlannerError';
  }
}

function roleHasPermission(roleSlug: string, permission: PlannerPermission): boolean {
  const perms = PLANNER_ROLE_PERMISSIONS[roleSlug as PlannerRoleSlug];
  return perms?.includes(permission) ?? false;
}

/**
 * Throws PlannerError('FORBIDDEN') if the user does not hold the given permission
 * in the tenant (or, for group-scoped permissions, within the specific group).
 *
 * Tenant-scoped grants cover all groups; group-scoped grants are narrowed to groupId.
 */
export async function requirePermission(
  userId: string,
  permission: PlannerPermission,
  tenantId: string,
  groupId?: string,
): Promise<void> {
  const { tenant_id: userTenantId, grants } = await listRoleGrants(userId);

  if (userTenantId !== tenantId) {
    throw new PlannerError('FORBIDDEN', `Missing permission: ${permission}`);
  }

  const allowed = grants.some((grant) => {
    if (!roleHasPermission(grant.role_slug, permission)) return false;
    if (grant.scope_type === 'tenant') return true;
    if (grant.scope_type === 'group' && groupId !== undefined) {
      return grant.scope_id === groupId;
    }
    return false;
  });

  if (!allowed) throw new PlannerError('FORBIDDEN', `Missing permission: ${permission}`);
}
