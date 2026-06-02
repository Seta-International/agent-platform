import type { SessionScope } from '@seta/core';
import { and, count, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection, groupMembers, groups } from '../db/schema.ts';
import type { GroupMemberRole, GroupMemberRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { isM365SystemActor } from './_actor.ts';

export interface GroupMembersPage {
  members: GroupMemberRow[];
  total: number;
}

export async function listGroupMembers(input: {
  group_id: string;
  limit?: number;
  offset?: number;
  session: SessionScope;
}): Promise<GroupMembersPage> {
  requirePermission(input.session, 'planner.group.member.read', input.group_id);

  const db = plannerDb();

  const [group] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, input.group_id), isNull(groups.deleted_at)))
    .limit(1);

  if (!group) {
    throw new PlannerError('NOT_FOUND', 'Group not found', { group_id: input.group_id });
  }

  if (group.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Group belongs to another tenant', {
      group_id: input.group_id,
    });
  }

  const filter = groupFilterFor(input.session);
  if (filter !== null && !isM365SystemActor(input.session) && !filter.includes(input.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', { group_id: input.group_id });
  }

  const limit = Math.min(input.limit ?? 500, 500);
  const offset = input.offset ?? 0;

  const [[countRow], rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(groupMembers)
      .where(eq(groupMembers.group_id, input.group_id)),
    db
      .select({
        group_id: groupMembers.group_id,
        user_id: groupMembers.user_id,
        role: groupMembers.role,
        added_at: groupMembers.added_at,
        added_by: groupMembers.added_by,
        display_name: assigneeProjection.display_name,
        email: assigneeProjection.email,
      })
      .from(groupMembers)
      .innerJoin(assigneeProjection, eq(assigneeProjection.user_id, groupMembers.user_id))
      .where(eq(groupMembers.group_id, input.group_id))
      .limit(limit)
      .offset(offset),
  ]);

  return {
    total: countRow?.total ?? 0,
    members: rows.map((r) => ({
      group_id: r.group_id,
      user_id: r.user_id,
      role: r.role as GroupMemberRole,
      display_name: r.display_name,
      email: r.email,
      added_at: r.added_at.toISOString(),
      added_by: r.added_by,
    })),
  };
}
