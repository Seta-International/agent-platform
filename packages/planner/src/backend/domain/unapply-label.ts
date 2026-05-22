import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { plans, taskLabels, tasks } from '../../db/schema.ts';
import { emitPlannerLabelUnapplied } from '../../events/emit-helpers.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function unapplyLabel(input: {
  task_id: string;
  label_id: string;
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
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: task.plan_id });

      requirePermission(input.session, 'planner.task.update', plan.group_id);

      const deleted = await tx
        .delete(taskLabels)
        .where(and(eq(taskLabels.task_id, input.task_id), eq(taskLabels.label_id, input.label_id)))
        .returning();

      // No-op if label was not applied.
      if (deleted.length === 0) return;

      await emitPlannerLabelUnapplied({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        group_id: plan.group_id,
        task_id: input.task_id,
        plan_id: task.plan_id,
        label_id: input.label_id,
      });
    },
  );
}
