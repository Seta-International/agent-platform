import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { emitPlannerPlanRestored } from '../../events/emit-helpers.ts';
import { plannerDb } from '../db/index.ts';
import { plans } from '../db/schema.ts';
import type { PlanRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { fetchCategoryDescriptions, planRowToDto } from './_plan-dto.ts';

type PlanDbRow = typeof plans.$inferSelect;

export async function restorePlan(input: {
  plan_id: string;
  session: SessionScope;
}): Promise<PlanRow> {
  let restored!: PlanDbRow;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [existing] = await tx.select().from(plans).where(eq(plans.id, input.plan_id)).limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
          plan_id: input.plan_id,
        });
      }

      await requirePermission(input.session, 'planner.plan.update', existing.group_id);

      if (existing.deleted_at === null) {
        throw new PlannerError('VALIDATION', 'Plan is not deleted');
      }

      const [row] = await tx
        .update(plans)
        .set({ deleted_at: null, updated_at: new Date(), version: existing.version + 1 })
        .where(eq(plans.id, input.plan_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Restore returned no row');
      restored = row;

      await emitPlannerPlanRestored({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        plan_id: existing.id,
        group_id: existing.group_id,
        version_after: existing.version + 1,
      });
    },
  );

  const categoryDescriptions = await fetchCategoryDescriptions(plannerDb(), restored.id);
  return planRowToDto(restored, categoryDescriptions);
}
