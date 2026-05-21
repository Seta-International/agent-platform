import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { plans, tasks } from '../../db/schema.ts';
import { emitPlannerTaskRestored } from '../../events/emit-helpers.ts';
import type { TaskRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { taskRowToDto } from './_task-dto.ts';

export async function restoreTask(input: {
  task_id: string;
  session: SessionScope;
}): Promise<TaskRow> {
  let restored!: typeof tasks.$inferSelect;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [existing] = await tx.select().from(tasks).where(eq(tasks.id, input.task_id)).limit(1);
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

      if (existing.deleted_at === null) {
        throw new PlannerError('VALIDATION', 'Task is not deleted');
      }

      const [row] = await tx
        .update(tasks)
        .set({ deleted_at: null, updated_at: new Date(), version: existing.version + 1 })
        .where(eq(tasks.id, input.task_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Restore returned no row');
      restored = row;

      await emitPlannerTaskRestored({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        task_id: existing.id,
        plan_id: existing.plan_id,
        group_id: plan.group_id,
        version_after: existing.version + 1,
      });
    },
  );

  return taskRowToDto(restored);
}
