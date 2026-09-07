import type { SessionScope } from '@seta/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { plannerDb } from './db/index.ts';
import {
  assigneeProjection,
  groupMembers,
  groups,
  plans,
  taskAssignments,
  tasks,
} from './db/schema.ts';

/**
 * Whether the caller can still reach any live group. Distinguishes "no tasks
 * matched" from "every group you belong to has been archived" (FUT-832 AC5),
 * which an empty task list alone cannot express.
 */
export async function hasVisibleActiveGroups(session: SessionScope): Promise<boolean> {
  const filter = await groupFilterFor(session);
  if (filter !== null && filter.length === 0) return false;

  const conditions = [eq(groups.tenant_id, session.tenant_id), isNull(groups.deleted_at)];
  if (filter !== null) conditions.push(inArray(groups.id, [...filter]));

  const [row] = await plannerDb()
    .select({ id: groups.id })
    .from(groups)
    .where(and(...conditions))
    .limit(1);
  return row !== undefined;
}

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

export interface MemberGroupWithState extends MemberGroup {
  archived: boolean;
}

/**
 * Same membership set as listMemberGroups, but keeps the archived rows and
 * labels them. Callers that must tell "archived" apart from "no such group"
 * (FUT-832 AC3) need the row; callers that only read active work do not.
 */
export async function listMemberGroupsWithState(
  userId: string,
  tenantId: string,
): Promise<MemberGroupWithState[]> {
  const rows = await plannerDb()
    .select({ id: groups.id, name: groups.name, deleted_at: groups.deleted_at })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.group_id))
    .where(and(eq(groupMembers.user_id, userId), eq(groups.tenant_id, tenantId)));
  return rows.map((r) => ({ id: r.id, name: r.name, archived: r.deleted_at !== null }));
}

/** Name + archived state of one group in the caller's tenant, or null. */
export async function getGroupState(
  tenantId: string,
  groupId: string,
): Promise<MemberGroupWithState | null> {
  const [row] = await plannerDb()
    .select({ id: groups.id, name: groups.name, deleted_at: groups.deleted_at })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.tenant_id, tenantId)))
    .limit(1);
  return row ? { id: row.id, name: row.name, archived: row.deleted_at !== null } : null;
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
