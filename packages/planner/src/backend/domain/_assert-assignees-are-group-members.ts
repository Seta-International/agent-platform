import { and, eq, inArray } from 'drizzle-orm';
import { groupMembers } from '../db/schema.ts';
import { PlannerError } from '../rbac.ts';

export async function assertAssigneesAreGroupMembers(
  // biome-ignore lint/suspicious/noExplicitAny: tx is the inner Drizzle transaction handle
  tx: any,
  groupId: string,
  userIds: string[],
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;

  const rows = await tx
    .select({ user_id: groupMembers.user_id })
    .from(groupMembers)
    .where(and(eq(groupMembers.group_id, groupId), inArray(groupMembers.user_id, unique)));

  const memberIds = new Set(rows.map((r: { user_id: string }) => r.user_id));
  const missing = unique.filter((id) => !memberIds.has(id));
  if (missing.length > 0) {
    throw new PlannerError('ASSIGNEE_NOT_GROUP_MEMBER', 'Assignee must be a member of the group', {
      group_id: groupId,
      user_ids: missing,
    });
  }
}
