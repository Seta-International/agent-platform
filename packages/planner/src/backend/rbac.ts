import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import type { PlannerPermission } from '../rbac.ts';
import { plannerDb } from './db/index.ts';
import { groupMembers } from './db/schema.ts';
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
  | 'DUPLICATE_LINK'
  | 'RESERVED_FOR_SYSTEM_ACTOR'
  | 'CATEGORY_SLOT_OUT_OF_RANGE'
  | 'GROUP_NOT_LINKED'
  | 'PLAN_NOT_LINKED'
  | 'LABEL_NOT_SYNCABLE'
  | 'ASSIGNEE_NOT_M365_SYNCABLE'
  | 'ASSIGNEE_NOT_GROUP_MEMBER'
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

// The M365 system actor and tenant-wide admin roles (org.admin, tenant.admin) operate
// tenant-wide and bypass the group-scope check; cross-tenant access is blocked via
// tenant_id comparison inside each domain function instead.
export function isTenantWide(session: SessionScope): boolean {
  return (
    isM365SystemActor(session) ||
    session.role_summary.roles.some((r) => r === 'org.admin' || r === 'tenant.admin')
  );
}

/**
 * Group reach: does this user have a planner.group_members row for this group?
 * Tenant-blind — `group_members` carries no tenant column. Callers passing an
 * externally-sourced groupId must independently verify it belongs to the
 * caller's tenant (e.g. via `listMemberGroupIds` or a fetched row's tenant_id).
 */
export async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  const rows = await plannerDb()
    .select({ group_id: groupMembers.group_id })
    .from(groupMembers)
    .where(and(eq(groupMembers.group_id, groupId), eq(groupMembers.user_id, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function requirePermission(
  session: SessionScope,
  permission: PlannerPermission,
  groupId?: string,
): Promise<void> {
  if (!can(session, permission)) {
    throw new PlannerError('FORBIDDEN', `Missing permission: ${permission}`, {
      permission,
      group_id: groupId,
    });
  }

  // Group-scope check: permissions come solely from persona roles (can() above);
  // membership grants reach, checked live against planner-local group_members.
  if (
    groupId !== undefined &&
    !isTenantWide(session) &&
    !(await isGroupMember(session.user_id, groupId))
  ) {
    throw new PlannerError('FORBIDDEN', `No access to group`, { permission, group_id: groupId });
  }
}
