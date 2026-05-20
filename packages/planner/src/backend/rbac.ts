import type { SessionScope } from '@seta/core';
import { hasPermission } from '@seta/shared-rbac';
import {
  PLANNER_ROLE_PERMISSIONS,
  PLANNER_ROLE_SLUGS,
  type PlannerPermission,
  type PlannerRoleSlug,
} from '../roles.ts';

export type PlannerErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'CROSS_TENANT';

export class PlannerError extends Error {
  readonly code: PlannerErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: PlannerErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PlannerError';
    this.code = code;
    this.details = details;
  }
}

export function requirePermission(
  session: SessionScope,
  permission: PlannerPermission,
  groupId?: string,
): void {
  // org.admin / tenant.admin short-circuit through shared-rbac (grants everything).
  if (
    hasPermission(
      {
        roles: session.role_summary.roles,
        cross_tenant_read: session.role_summary.cross_tenant_read,
      },
      permission,
    )
  ) {
    return;
  }

  // org.viewer is cross-tenant read-only: allow only *.read permissions.
  if (session.role_summary.cross_tenant_read && permission.endsWith('.read')) {
    return;
  }

  // Planner role evaluation: does the session hold any planner role that grants this permission?
  const plannerRolesHeld = session.role_summary.roles.filter((r): r is PlannerRoleSlug =>
    (PLANNER_ROLE_SLUGS as readonly string[]).includes(r),
  );
  const grantedByAnyPlannerRole = plannerRolesHeld.some((roleSlug) =>
    PLANNER_ROLE_PERMISSIONS[roleSlug].includes(permission),
  );
  if (!grantedByAnyPlannerRole) {
    throw new PlannerError('FORBIDDEN', `Missing permission: ${permission}`, {
      permission,
      group_id: groupId,
    });
  }

  // Group-scope check: when groupId is given, the session must have access to that group.
  // accessible_group_ids is populated from group-scoped role_grants in core/session/scope.ts.
  if (groupId !== undefined && !session.accessible_group_ids.includes(groupId)) {
    throw new PlannerError('FORBIDDEN', `No access to group`, {
      permission,
      group_id: groupId,
    });
  }
}
