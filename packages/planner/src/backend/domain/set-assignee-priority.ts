import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { plans, taskAssignments, tasks } from '../../db/schema.ts';
import { emitPlannerTaskUpdated } from '../../events/emit-helpers.ts';
import type { TaskRow } from '../dto.ts';
import type { SetAssigneePriorityInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { taskRowToDto } from './_task-dto.ts';

type TaskDbRow = typeof tasks.$inferSelect;

export async function setAssigneePriority(
  input: SetAssigneePriorityInput & { session: SessionScope },
): Promise<TaskRow> {
  return withSpan(
    'planner.task.set-assignee-priority',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.task_id': input.task_id,
    },
    () => setAssigneePriorityImpl(input),
  );
}

async function setAssigneePriorityImpl(
  input: SetAssigneePriorityInput & { session: SessionScope },
): Promise<TaskRow> {
  let result!: TaskDbRow;

  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [task] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
        .limit(1);
      if (!task) throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      if (task.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: task.plan_id,
        });

      const [assignment] = await tx
        .select({ user_id: taskAssignments.user_id })
        .from(taskAssignments)
        .where(
          and(
            eq(taskAssignments.task_id, input.task_id),
            eq(taskAssignments.user_id, input.session.user_id),
          ),
        )
        .limit(1);

      if (!assignment) {
        requirePermission(input.session, 'planner.task.update', plan.group_id);
      }

      if (task.assignee_priority === input.value) {
        result = task;
        return;
      }

      const [updated] = await tx
        .update(tasks)
        .set({
          assignee_priority: input.value,
          updated_at: new Date(),
          version: task.version + 1,
        })
        .where(eq(tasks.id, input.task_id))
        .returning();
      if (!updated) throw new PlannerError('VALIDATION', 'Update returned no row');
      result = updated;

      await emitPlannerTaskUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        task_id: task.id,
        plan_id: task.plan_id,
        group_id: plan.group_id,
        before: { assignee_priority: task.assignee_priority },
        after: { assignee_priority: input.value },
        changed_fields: ['assignee_priority'],
        version_before: task.version,
        version_after: task.version + 1,
      });
    },
  );

  return taskRowToDto(result);
}
