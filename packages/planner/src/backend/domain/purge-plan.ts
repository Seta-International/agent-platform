import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNotNull } from 'drizzle-orm';
import { emitPlannerPlanPurged } from '../../events/emit-helpers.ts';
import { plans, tasks } from '../db/schema.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function purgePlan(input: { plan_id: string; session: SessionScope }): Promise<void> {
  await requirePermission(input.session, 'planner.trash.empty');

  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [existing] = await tx.select().from(plans).where(eq(plans.id, input.plan_id)).limit(1);

      if (!existing) {
        // Idempotency: Already purged/missing item -> return success (204 behavior)
        return;
      }

      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
      }

      if (existing.deleted_at === null) {
        throw new PlannerError('CONFLICT', 'Plan is not in trash', { plan_id: input.plan_id });
      }

      // Explicitly delete child tasks for plan_id first (tasks.plan_id has no DB-level onDelete cascade)
      await tx
        .delete(tasks)
        .where(and(eq(tasks.plan_id, input.plan_id), eq(tasks.tenant_id, input.session.tenant_id)));

      // Delete plan row (cascades to buckets, labels, plan_categories)
      const deleted = await tx
        .delete(plans)
        .where(
          and(
            eq(plans.id, input.plan_id),
            eq(plans.tenant_id, input.session.tenant_id),
            isNotNull(plans.deleted_at),
          ),
        )
        .returning({ id: plans.id });

      if (deleted.length > 0) {
        await emitPlannerPlanPurged({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: existing.tenant_id,
          plan_id: existing.id,
          group_id: existing.group_id,
          version_before: existing.version,
          purged_at: new Date().toISOString(),
        });
      }
    },
  );
}
