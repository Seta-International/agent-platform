import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { emitPlannerGroupPurged } from '../../events/emit-helpers.ts';
import { groups, plans, tasks } from '../db/schema.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function purgeGroup(input: {
  group_id: string;
  session: SessionScope;
}): Promise<void> {
  await requirePermission(input.session, 'planner.trash.empty');

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
        .where(eq(groups.id, input.group_id))
        .limit(1);

      if (!existing) {
        // Idempotency: Already purged/missing item -> return success (204 behavior)
        return;
      }

      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('NOT_FOUND', 'Group not found', { group_id: input.group_id });
      }

      if (existing.deleted_at === null) {
        throw new PlannerError('CONFLICT', 'Group is not in trash', { group_id: input.group_id });
      }

      // 1. Find all plan_ids belonging to this group
      const groupPlans = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(
          and(eq(plans.group_id, input.group_id), eq(plans.tenant_id, input.session.tenant_id)),
        );

      const planIds = groupPlans.map((p) => p.id);

      // 2. Delete all tasks for these plans
      if (planIds.length > 0) {
        await tx
          .delete(tasks)
          .where(
            and(inArray(tasks.plan_id, planIds), eq(tasks.tenant_id, input.session.tenant_id)),
          );
      }

      // 3. Delete all plans for this group
      await tx
        .delete(plans)
        .where(
          and(eq(plans.group_id, input.group_id), eq(plans.tenant_id, input.session.tenant_id)),
        );

      // 4. Delete group row (cascades to group_members, group_join_requests)
      const deleted = await tx
        .delete(groups)
        .where(
          and(
            eq(groups.id, input.group_id),
            eq(groups.tenant_id, input.session.tenant_id),
            isNotNull(groups.deleted_at),
          ),
        )
        .returning({ id: groups.id });

      if (deleted.length > 0) {
        await emitPlannerGroupPurged({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: existing.tenant_id,
          group_id: existing.id,
          version_before: existing.version,
          purged_at: new Date().toISOString(),
        });
      }
    },
  );
}
