import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { emitPlannerTaskReferenceRemoved } from '../../events/emit-helpers.ts';
import { plans, taskReferences, tasks } from '../db/schema.ts';
import type { RemoveTaskReferenceInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isTaskLinkKind, TASK_LINK_KIND_LIST } from './_task-link-row.ts';

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

      await requirePermission(input.session, 'planner.task.update', plan.group_id);

      const deleted = await tx
        .delete(taskReferences)
        .where(
          and(
            eq(taskReferences.task_id, input.task_id),
            eq(taskReferences.url, input.url),
            eq(taskReferences.tenant_id, input.session.tenant_id),
            // §3.11: this writer gates one endpoint, so it must not drop a link
            // the OTHER endpoint has a say in. Link removal goes through
            // DELETE /task-references/:referenceId.
            notInArray(taskReferences.type, TASK_LINK_KIND_LIST),
          ),
        )
        .returning({ id: taskReferences.id });

      if (deleted.length === 0) {
        // One extra read, on the failure path only, so the refusal can say what
        // is actually wrong instead of claiming the row does not exist.
        const [row] = await tx
          .select({ type: taskReferences.type })
          .from(taskReferences)
          .where(
            and(
              eq(taskReferences.task_id, input.task_id),
              eq(taskReferences.url, input.url),
              eq(taskReferences.tenant_id, input.session.tenant_id),
            ),
          )
          .limit(1);
        if (row && isTaskLinkKind(row.type)) {
          throw new PlannerError(
            'VALIDATION',
            'That is a task relationship, not a reference. Remove it from Related tasks.',
            { task_id: input.task_id, url: input.url, type: row.type },
          );
        }
        throw new PlannerError('NOT_FOUND', 'Reference not found', {
          task_id: input.task_id,
          url: input.url,
        });
      }

      await emitPlannerTaskReferenceRemoved({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        group_id: plan.group_id,
        task_id: task.id,
        plan_id: task.plan_id,
        url: input.url,
      });
    },
  );
}
