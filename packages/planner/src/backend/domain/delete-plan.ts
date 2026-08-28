import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerPlanDeleted } from '../../events/emit-helpers.ts';
import { plans } from '../db/schema.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function deletePlan(input: {
  plan_id: string;
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
        .from(plans)
        .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
          plan_id: input.plan_id,
        });
      }

      await requirePermission(input.session, 'planner.plan.delete', existing.group_id);

      const deletedAt = new Date();
      const deleted = await tx
        .update(plans)
        .set({ deleted_at: deletedAt, updated_at: new Date(), version: existing.version + 1 })
        // guard: 0 rows ⇒ the row changed since our read (lost-update prevention)
        .where(and(eq(plans.id, input.plan_id), eq(plans.version, input.expected_version)))
        .returning({ id: plans.id });
      if (deleted.length === 0) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

      await emitPlannerPlanDeleted({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        plan_id: existing.id,
        group_id: existing.group_id,
        version_before: existing.version,
        deleted_at: deletedAt.toISOString(),
      });
    },
  );
}
