import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import type { PlannerPermission } from '../rbac.ts';
import { isM365SystemActor } from './domain/_actor.ts';

export type PlannerErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'CROSS_TENANT'
  | 'LINKED_GROUP_IMMUTABLE_MEMBERS'
  | 'LINKED_DUPLICATE'
  | 'LINKED_DUPLICATE_PLAN'
  | 'DUPLICATE_REFERENCE'
  | 'RESERVED_FOR_SYSTEM_ACTOR'
  | 'CATEGORY_SLOT_OUT_OF_RANGE'
  | 'GROUP_NOT_LINKED'
  | 'PLAN_NOT_LINKED'
  | 'LABEL_NOT_SYNCABLE'
  | 'ASSIGNEE_NOT_M365_SYNCABLE'
  | 'JOIN_REQUEST_PRIVATE_GROUP'
  | 'ALREADY_MEMBER'
  | 'JOIN_REQUEST_DUPLICATE'
  | 'JOIN_REQUEST_NOT_FOUND';

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
  if (!can(session, permission)) {
    throw new PlannerError('FORBIDDEN', `Missing permission: ${permission}`, {
      permission,
      group_id: groupId,
    });
  }

  // Group-scope check: when groupId is given, the session must have access to that group.
  // accessible_group_ids is populated from group-scoped role_grants in core/session/scope.ts.
  // The M365 system actor and tenant-wide admin roles (org.admin, tenant.admin) operate
  // tenant-wide and bypass the group-scope check; cross-tenant access is blocked via
  // tenant_id comparison inside each domain function instead.
  const isTenantWide =
    isM365SystemActor(session) ||
    session.role_summary.roles.some((r) => r === 'org.admin' || r === 'tenant.admin');
  if (groupId !== undefined && !isTenantWide && !session.accessible_group_ids.includes(groupId)) {
    throw new PlannerError('FORBIDDEN', `No access to group`, { permission, group_id: groupId });
  }
}
