import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerGroupJoinRequested } from '../../events/emit-helpers.ts';
import { groupJoinRequests, groupMembers, groups } from '../db/schema.ts';
import type { GroupJoinRequestRow } from '../dto.ts';
import type { CreateJoinRequestInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function createJoinRequest(
  input: CreateJoinRequestInput,
): Promise<GroupJoinRequestRow> {
  requirePermission(input.session, 'planner.group.read');

  let inserted!: typeof groupJoinRequests.$inferSelect;

  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [group] = await tx
        .select()
        .from(groups)
        .where(and(eq(groups.id, input.group_id), isNull(groups.deleted_at)))
        .limit(1);

      if (!group)
        throw new PlannerError('NOT_FOUND', 'Group not found', { group_id: input.group_id });
      if (group.tenant_id !== input.session.tenant_id)
        throw new PlannerError('CROSS_TENANT', 'Group belongs to another tenant', {
          group_id: input.group_id,
        });
      if (group.visibility !== 'public')
        throw new PlannerError(
          'JOIN_REQUEST_PRIVATE_GROUP',
          'Cannot request to join a private group',
          { group_id: input.group_id },
        );

      const [existingMember] = await tx
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.group_id, input.group_id),
            eq(groupMembers.user_id, input.session.user_id),
          ),
        )
        .limit(1);

      if (existingMember)
        throw new PlannerError('ALREADY_MEMBER', 'You are already a member of this group', {
          group_id: input.group_id,
        });

      const [existingRequest] = await tx
        .select()
        .from(groupJoinRequests)
        .where(
          and(
            eq(groupJoinRequests.group_id, input.group_id),
            eq(groupJoinRequests.user_id, input.session.user_id),
          ),
        )
        .limit(1);

      if (existingRequest && existingRequest.status === 'pending')
        throw new PlannerError('JOIN_REQUEST_DUPLICATE', 'A pending request already exists', {
          group_id: input.group_id,
        });

      if (existingRequest) {
        const [row] = await tx
          .update(groupJoinRequests)
          .set({
            status: 'pending',
            requested_at: new Date(),
            resolved_at: null,
            resolved_by: null,
          })
          .where(
            and(
              eq(groupJoinRequests.group_id, input.group_id),
              eq(groupJoinRequests.user_id, input.session.user_id),
            ),
          )
          .returning();
        // biome-ignore lint/style/noNonNullAssertion: .returning() always returns a row when inserting one record
        inserted = row!;
      } else {
        const [row] = await tx
          .insert(groupJoinRequests)
          .values({ group_id: input.group_id, user_id: input.session.user_id })
          .returning();
        // biome-ignore lint/style/noNonNullAssertion: .returning() always returns a row when inserting one record
        inserted = row!;
      }

      await emitPlannerGroupJoinRequested({
        actor: { type: 'user', user_id: input.session.user_id },
        group_id: input.group_id,
        user_id: input.session.user_id,
        tenant_id: input.session.tenant_id,
      });
    },
  );

  return {
    group_id: inserted.group_id,
    user_id: inserted.user_id,
    status: inserted.status as GroupJoinRequestRow['status'],
    requested_at: inserted.requested_at.toISOString(),
    resolved_at: inserted.resolved_at?.toISOString() ?? null,
    resolved_by: inserted.resolved_by,
    display_name: input.session.display_name,
    email: input.session.email,
  };
}
