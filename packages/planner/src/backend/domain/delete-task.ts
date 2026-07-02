import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerTaskDeleted } from '../../events/emit-helpers.ts';
import { plans, tasks } from '../db/schema.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function deleteTask(input: {
  task_id: string;
  expected_version: number;
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

      await requirePermission(input.session, 'planner.task.delete', plan.group_id);

      const deletedAt = new Date();
      const deleted = await tx
        .update(tasks)
        .set({ deleted_at: deletedAt, updated_at: deletedAt, version: existing.version + 1 })
        // guard: 0 rows ⇒ the row changed since our read (lost-update prevention)
        .where(and(eq(tasks.id, input.task_id), eq(tasks.version, input.expected_version)))
        .returning({ id: tasks.id });
      if (deleted.length === 0) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

      await emitPlannerTaskDeleted({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        task_id: existing.id,
        plan_id: existing.plan_id,
        group_id: plan.group_id,
        version_before: existing.version,
        deleted_at: deletedAt.toISOString(),
      });
    },
  );
}
