import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groupMembers, groups } from '../../db/schema.ts';
import { emitPlannerGroupMemberAdded } from '../../events/emit-helpers.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function addGroupMember(input: {
  group_id: string;
  user_id: string;
  session: SessionScope;
}): Promise<void> {
  requirePermission(input.session, 'planner.group.member.write', input.group_id);

  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(groups)
        .where(and(eq(groups.id, input.group_id), isNull(groups.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Group not found', { group_id: input.group_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Group belongs to another tenant', {
          group_id: input.group_id,
        });
      }

      const inserted = await tx
        .insert(groupMembers)
        .values({
          group_id: input.group_id,
          user_id: input.user_id,
          added_by: input.session.user_id,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length > 0) {
        await emitPlannerGroupMemberAdded({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: existing.tenant_id,
          group_id: existing.id,
          user_id: input.user_id,
        });
      }
    },
  );
}
