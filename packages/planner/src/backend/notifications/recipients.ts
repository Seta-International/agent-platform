import { eq } from 'drizzle-orm';
import type { PlannerDb } from '../../db/index.ts';
import { groupMembers } from '../../db/schema.ts';

export async function resolveGroupMemberIds(
  _tenantId: string,
  groupId: string,
  tx: PlannerDb,
): Promise<string[]> {
  const rows = await tx
    .select({ user_id: groupMembers.user_id })
    .from(groupMembers)
    .where(eq(groupMembers.group_id, groupId));
  return rows.map((r) => r.user_id);
}
