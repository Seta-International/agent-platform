import type { SessionScope } from '@seta/core';
import { requestNotification } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { plans, taskAssignments, tasks } from '../../db/schema.ts';
import { emitPlannerTaskReopened } from '../../events/emit-helpers.ts';
import type { TaskRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { taskRowToDto } from './_task-dto.ts';

export async function reopenTask(input: {
  task_id: string;
  expected_version: number;
  session: SessionScope;
}): Promise<TaskRow> {
  let result!: typeof tasks.$inferSelect;
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
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, existing.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: existing.plan_id,
        });

      requirePermission(input.session, 'planner.task.update', plan.group_id);

      if (existing.version !== input.expected_version) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

      if (existing.percent_complete !== 100) {
        throw new PlannerError('VALIDATION', 'Task is not completed', {
          task_id: input.task_id,
          percent_complete: existing.percent_complete,
        });
      }

      const versionAfter = existing.version + 1;
      const now = new Date();

      const [updated] = await tx
        .update(tasks)
        .set({ percent_complete: 0, is_deferred: false, updated_at: now, version: versionAfter })
        .where(eq(tasks.id, input.task_id))
        .returning();
      if (!updated) throw new PlannerError('VALIDATION', 'Update returned no row');
      result = updated;

      const [assignment] = await tx
        .select({ user_id: taskAssignments.user_id })
        .from(taskAssignments)
        .where(eq(taskAssignments.task_id, existing.id))
        .limit(1);

      const { eventId } = await emitPlannerTaskReopened({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        task_id: existing.id,
        plan_id: existing.plan_id,
        group_id: plan.group_id,
        version_before: existing.version,
        version_after: versionAfter,
      });

      const recipientSet = new Set<string>();
      if (existing.created_by) recipientSet.add(existing.created_by);
      if (assignment?.user_id) recipientSet.add(assignment.user_id);
      recipientSet.delete(input.session.user_id);
      const recipients = [...recipientSet];

      await requestNotification({
        tenant_id: existing.tenant_id,
        event_type: 'planner.task.reopened',
        user_ids: recipients,
        source_event_id: eventId,
        payload: {
          title: 'Task reopened',
          body: `"${existing.title}" was reopened`,
          task_id: existing.id,
          plan_id: existing.plan_id,
          group_id: plan.group_id,
          actor: { user_id: input.session.user_id, name: input.session.user_id },
        },
      });
    },
  );

  return taskRowToDto(result);
}
