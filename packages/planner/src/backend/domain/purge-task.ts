import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNotNull } from 'drizzle-orm';
import { emitPlannerTaskPurged } from '../../events/emit-helpers.ts';
import { plans, tasks } from '../db/schema.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function purgeTask(input: { task_id: string; session: SessionScope }): Promise<void> {
  await requirePermission(input.session, 'planner.trash.empty');

  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [existing] = await tx.select().from(tasks).where(eq(tasks.id, input.task_id)).limit(1);

      if (!existing) {
        // Idempotency: Already purged/missing item -> return success (204 behavior)
        return;
      }

      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      }

      if (existing.deleted_at === null) {
        throw new PlannerError('CONFLICT', 'Task is not in trash', { task_id: input.task_id });
      }

      const [plan] = await tx
        .select({ group_id: plans.group_id })
        .from(plans)
        .where(eq(plans.id, existing.plan_id))
        .limit(1);

      const deleted = await tx
        .delete(tasks)
        .where(
          and(
            eq(tasks.id, input.task_id),
            eq(tasks.tenant_id, input.session.tenant_id),
            isNotNull(tasks.deleted_at),
          ),
        )
        .returning({ id: tasks.id });

      if (deleted.length > 0) {
        await emitPlannerTaskPurged({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: existing.tenant_id,
          task_id: existing.id,
          plan_id: existing.plan_id,
          group_id: plan?.group_id ?? existing.plan_id,
          version_before: existing.version,
          purged_at: new Date().toISOString(),
        });
      }
    },
  );
}
