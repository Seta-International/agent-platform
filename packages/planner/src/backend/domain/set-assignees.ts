import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import { emitPlannerTaskAssigned } from '../../events/emit-helpers.ts';
import { plans, taskAssignments, tasks } from '../db/schema.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { assertAssigneesAreGroupMembers } from './_assert-assignees-are-group-members.ts';

/**
 * Atomically replaces the full assignee list for a task.
 * - Rows not in `user_ids` are deleted.
 * - Rows already in `user_ids` are preserved (no duplicate event).
 * - New rows are inserted and a task.assigned event is emitted for each.
 * Passing an empty `user_ids` array removes all assignees.
 */
export async function setAssignees(input: {
  task_id: string;
  user_ids: string[];
  session: SessionScope;
}): Promise<void> {
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
        .from(tasks)
        .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      if (existing.tenant_id !== input.session.tenant_id)
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });

      const [plan] = await tx.select().from(plans).where(eq(plans.id, existing.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: existing.plan_id,
        });

      await requirePermission(input.session, 'planner.task.assign', plan.group_id);

      await assertAssigneesAreGroupMembers(tx, plan.group_id, input.user_ids);

      // Remove assignees no longer in the desired list.
      if (input.user_ids.length > 0) {
        await tx
          .delete(taskAssignments)
          .where(
            and(
              eq(taskAssignments.task_id, input.task_id),
              notInArray(taskAssignments.user_id, input.user_ids),
            ),
          );
      } else {
        await tx.delete(taskAssignments).where(eq(taskAssignments.task_id, input.task_id));
      }

      // Find which user_ids are genuinely new (not already assigned).
      const retained =
        input.user_ids.length > 0
          ? await tx
              .select({ user_id: taskAssignments.user_id })
              .from(taskAssignments)
              .where(
                and(
                  eq(taskAssignments.task_id, input.task_id),
                  inArray(taskAssignments.user_id, input.user_ids),
                ),
              )
          : [];

      const retainedIds = new Set(retained.map((r) => r.user_id));
      const newUserIds = input.user_ids.filter((uid) => !retainedIds.has(uid));

      // Insert new assignees and emit events for each.
      for (const userId of newUserIds) {
        await tx.insert(taskAssignments).values({
          tenant_id: existing.tenant_id,
          task_id: input.task_id,
          user_id: userId,
          assigned_by: input.session.user_id,
        });

        await emitPlannerTaskAssigned({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: existing.tenant_id,
          task_id: existing.id,
          plan_id: existing.plan_id,
          group_id: plan.group_id,
          user_id: userId,
        });
      }
    },
  );
}
