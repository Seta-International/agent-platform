import type { SessionScope } from '@seta/core';
import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from './db/index.ts';
import {
  assigneeProjection,
  groupMembers,
  groups,
  plans,
  taskAssignments,
  tasks,
} from './db/schema.ts';

export function isTenantAdminish(session: SessionScope): boolean {
  return session.role_summary.roles.some(
    (r) => r === 'org.admin' || r === 'tenant.admin' || r === 'system.integrations.m365',
  );
}

/** Groups this user has planner-local membership in, tenant-bound via the groups join. */
export async function listMemberGroupIds(userId: string, tenantId: string): Promise<string[]> {
  const rows = await plannerDb()
    .select({ group_id: groupMembers.group_id })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.group_id))
    .where(
      and(
        eq(groupMembers.user_id, userId),
        eq(groups.tenant_id, tenantId),
        isNull(groups.deleted_at),
      ),
    );
  return rows.map((r) => r.group_id);
}

export interface MemberGroup {
  id: string;
  name: string;
}

/** Groups this user belongs to with id + name, tenant-bound. */
export async function listMemberGroups(userId: string, tenantId: string): Promise<MemberGroup[]> {
  return plannerDb()
    .select({ id: groups.id, name: groups.name })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.group_id))
    .where(
      and(
        eq(groupMembers.user_id, userId),
        eq(groups.tenant_id, tenantId),
        isNull(groups.deleted_at),
      ),
    );
}

/** user_ids belonging to a group, tenant-bound via the groups join. */
export async function listGroupMemberUserIds(tenantId: string, groupId: string): Promise<string[]> {
  const rows = await plannerDb()
    .select({ user_id: groupMembers.user_id })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.group_id))
    .where(
      and(
        eq(groupMembers.group_id, groupId),
        eq(groups.tenant_id, tenantId),
        isNull(groups.deleted_at),
      ),
    );
  return rows.map((r) => r.user_id);
}

/**
 * Active (not deactivated) members of a group with their display names, tenant-
 * bound. Joins group membership to the assignee projection so a caller can build
 * a bounded candidate set without a cross-module read for names.
 */
export async function listActiveGroupMemberProfiles(
  tenantId: string,
  groupId: string,
): Promise<Array<{ user_id: string; display_name: string }>> {
  return plannerDb()
    .select({
      user_id: groupMembers.user_id,
      display_name: assigneeProjection.display_name,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.group_id))
    .innerJoin(assigneeProjection, eq(assigneeProjection.user_id, groupMembers.user_id))
    .where(
      and(
        eq(groupMembers.group_id, groupId),
        eq(groups.tenant_id, tenantId),
        eq(assigneeProjection.tenant_id, tenantId),
        isNull(groups.deleted_at),
        isNull(assigneeProjection.deactivated_at),
      ),
    );
}

/** The owning group id of a task (via its plan), tenant-bound. Null when the
 *  task is missing/deleted or outside the tenant. */
export async function getTaskGroupId(tenantId: string, taskId: string): Promise<string | null> {
  const rows = await plannerDb()
    .select({ group_id: plans.group_id })
    .from(tasks)
    .innerJoin(plans, eq(plans.id, tasks.plan_id))
    .where(and(eq(tasks.id, taskId), eq(tasks.tenant_id, tenantId), isNull(tasks.deleted_at)))
    .limit(1);
  return rows[0]?.group_id ?? null;
}

/** user_ids currently assigned to a task, tenant-bound. Empty when the task is
 *  missing/deleted or outside the tenant. Used to exclude people already on the
 *  task from assignee suggestions. */
export async function listTaskAssigneeUserIds(tenantId: string, taskId: string): Promise<string[]> {
  const rows = await plannerDb()
    .select({ user_id: taskAssignments.user_id })
    .from(taskAssignments)
    .innerJoin(tasks, eq(tasks.id, taskAssignments.task_id))
    .where(
      and(
        eq(taskAssignments.task_id, taskId),
        eq(taskAssignments.tenant_id, tenantId),
        isNull(tasks.deleted_at),
      ),
    );
  return rows.map((r) => r.user_id);
}

export async function groupFilterFor(session: SessionScope): Promise<readonly string[] | null> {
  if (isTenantAdminish(session) || session.role_summary.cross_tenant_read) return null;
  return listMemberGroupIds(session.user_id, session.tenant_id);
}
