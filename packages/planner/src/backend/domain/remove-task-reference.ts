import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { plans, taskReferences, tasks } from '../../db/schema.ts';
import { emitPlannerTaskReferenceRemoved } from '../../events/emit-helpers.ts';
import type { RemoveTaskReferenceInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function removeTaskReference(
  input: RemoveTaskReferenceInput & { session: SessionScope },
): Promise<void> {
  return withSpan(
    'planner.task.remove-reference',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.task_id': input.task_id,
    },
    () => removeTaskReferenceImpl(input),
  );
}

async function removeTaskReferenceImpl(
  input: RemoveTaskReferenceInput & { session: SessionScope },
): Promise<void> {
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

      requirePermission(input.session, 'planner.task.update', plan.group_id);

      const deleted = await tx
        .delete(taskReferences)
        .where(
          and(
            eq(taskReferences.task_id, input.task_id),
            eq(taskReferences.url, input.url),
            eq(taskReferences.tenant_id, input.session.tenant_id),
          ),
        )
        .returning({ id: taskReferences.id });

      if (deleted.length === 0) {
        throw new PlannerError('NOT_FOUND', 'Reference not found', {
          task_id: input.task_id,
          url: input.url,
        });
      }

      await emitPlannerTaskReferenceRemoved({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        task_id: task.id,
        plan_id: task.plan_id,
        url: input.url,
      });
    },
  );
}
