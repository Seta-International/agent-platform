import { and, eq, ilike, isNull, or } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection, groupMembers, groups } from '../db/schema.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import type { PlannerSessionScope } from './_actor.ts';

export interface GroupMemberCandidate {
  user_id: string;
  display_name: string;
  email: string;
}

export async function listGroupMemberCandidates(input: {
  group_id: string;
  search?: string;
  limit?: number;
  session: PlannerSessionScope;
}): Promise<GroupMemberCandidate[]> {
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

  const cap = Math.min(input.limit ?? 20, 50);
  // Escape LIKE special characters so user input is treated as literal text.
  const search = input.search ? input.search.replace(/[\\%_]/g, '\\$&') : undefined;

  // Left-join anti-pattern: rows with no matching group_members row have groupMembers.user_id = null.
  const rows = await db
    .select({
      user_id: assigneeProjection.user_id,
      display_name: assigneeProjection.display_name,
      email: assigneeProjection.email,
    })
    .from(assigneeProjection)
    .leftJoin(
      groupMembers,
      and(
        eq(groupMembers.user_id, assigneeProjection.user_id),
        eq(groupMembers.group_id, input.group_id),
      ),
    )
    .where(
      and(
        eq(assigneeProjection.tenant_id, input.session.tenant_id),
        isNull(assigneeProjection.deactivated_at),
        isNull(groupMembers.user_id),
        search
          ? or(
              ilike(assigneeProjection.display_name, `%${search}%`),
              ilike(assigneeProjection.email, `%${search}%`),
            )
          : undefined,
      ),
    )
    .limit(cap);

  return rows.map((r) => ({
    user_id: r.user_id,
    display_name: r.display_name,
    email: r.email,
  }));
}
