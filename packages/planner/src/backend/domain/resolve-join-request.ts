import { withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { groupJoinRequests } from '../db/schema.ts';
import type { GroupJoinRequestRow } from '../dto.ts';
import type { ResolveJoinRequestInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { addGroupMember } from './add-group-member.ts';

export async function resolveJoinRequest(
  input: ResolveJoinRequestInput,
): Promise<GroupJoinRequestRow> {
  requirePermission(input.session, 'planner.group.member.write', input.group_id);

  const db = plannerDb();

  const [request] = await db
    .select()
    .from(groupJoinRequests)
    .where(
      and(
        eq(groupJoinRequests.group_id, input.group_id),
        eq(groupJoinRequests.user_id, input.user_id),
      ),
    )
    .limit(1);

  if (!request || request.status !== 'pending')
    throw new PlannerError('JOIN_REQUEST_NOT_FOUND', 'No pending join request found', {
      group_id: input.group_id,
      user_id: input.user_id,
    });

  if (input.action === 'approved') {
    await addGroupMember({
      group_id: input.group_id,
      user_id: input.user_id,
      session: input.session,
    });
  }

  let updated!: typeof groupJoinRequests.$inferSelect;
  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.session.tenant_id } },
    async (tx) => {
      const [row] = await tx
        .update(groupJoinRequests)
        .set({
          status: input.action,
          resolved_at: new Date(),
          resolved_by: input.session.user_id,
        })
        .where(
          and(
            eq(groupJoinRequests.group_id, input.group_id),
            eq(groupJoinRequests.user_id, input.user_id),
          ),
        )
        .returning();
      // biome-ignore lint/style/noNonNullAssertion: .returning() always returns a row when updating one record
      updated = row!;
    },
  );

  return {
    group_id: updated.group_id,
    user_id: updated.user_id,
    status: updated.status as GroupJoinRequestRow['status'],
    requested_at: updated.requested_at.toISOString(),
    resolved_at: updated.resolved_at?.toISOString() ?? null,
    resolved_by: updated.resolved_by,
    display_name: '',
    email: '',
  };
}
