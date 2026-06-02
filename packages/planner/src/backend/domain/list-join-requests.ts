import { and, asc, eq } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection, groupJoinRequests } from '../db/schema.ts';
import type { GroupJoinRequestRow } from '../dto.ts';
import { requirePermission } from '../rbac.ts';
import type { PlannerSessionScope } from './_actor.ts';

export async function listJoinRequests(input: {
  group_id: string;
  status?: 'pending' | 'approved' | 'rejected';
  session: PlannerSessionScope;
}): Promise<GroupJoinRequestRow[]> {
  requirePermission(input.session, 'planner.group.member.read', input.group_id);

  const db = plannerDb();
  const conditions = [eq(groupJoinRequests.group_id, input.group_id)];
  if (input.status) conditions.push(eq(groupJoinRequests.status, input.status));

  const rows = await db
    .select({
      group_id: groupJoinRequests.group_id,
      user_id: groupJoinRequests.user_id,
      status: groupJoinRequests.status,
      requested_at: groupJoinRequests.requested_at,
      resolved_at: groupJoinRequests.resolved_at,
      resolved_by: groupJoinRequests.resolved_by,
      display_name: assigneeProjection.display_name,
      email: assigneeProjection.email,
    })
    .from(groupJoinRequests)
    .leftJoin(assigneeProjection, eq(groupJoinRequests.user_id, assigneeProjection.user_id))
    .where(and(...conditions))
    .orderBy(asc(groupJoinRequests.requested_at));

  return rows.map((r) => ({
    group_id: r.group_id,
    user_id: r.user_id,
    status: r.status as GroupJoinRequestRow['status'],
    requested_at: r.requested_at.toISOString(),
    resolved_at: r.resolved_at?.toISOString() ?? null,
    resolved_by: r.resolved_by,
    display_name: r.display_name ?? r.user_id,
    email: r.email ?? '',
  }));
}
