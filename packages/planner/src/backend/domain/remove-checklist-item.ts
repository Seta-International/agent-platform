import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { checklistItems, plans, tasks } from '../../db/schema.ts';
import { emitPlannerChecklistItemRemoved } from '../../events/emit-helpers.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function removeChecklistItem(input: {
  item_id: string;
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
        .from(checklistItems)
        .where(eq(checklistItems.id, input.item_id))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Checklist item not found', { item_id: input.item_id });

      const [task] = await tx.select().from(tasks).where(eq(tasks.id, existing.task_id)).limit(1);
      if (!task)
        throw new PlannerError('NOT_FOUND', 'Parent task not found', { task_id: existing.task_id });
      if (task.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: existing.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: task.plan_id });

      requirePermission(input.session, 'planner.task.update', plan.group_id);

      await tx.delete(checklistItems).where(eq(checklistItems.id, input.item_id));

      await emitPlannerChecklistItemRemoved({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: task.tenant_id,
        group_id: plan.group_id,
        item_id: existing.id,
        task_id: existing.task_id,
        plan_id: task.plan_id,
      });
    },
  );
}
