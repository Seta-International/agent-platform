import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerPlanUpdated } from '../../events/emit-helpers.ts';
import type { PlanFieldKey } from '../../events/types.ts';
import { plannerDb } from '../db/index.ts';
import { plans } from '../db/schema.ts';
import type { PlanRow } from '../dto.ts';
import type { UpdatePlanPatch } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { fetchCategoryDescriptions, planRowToDto } from './_plan-dto.ts';

type PlanDbRow = typeof plans.$inferSelect;

export async function updatePlan(input: {
  plan_id: string;
  expected_version: number;
  patch: UpdatePlanPatch;
  session: SessionScope;
}): Promise<PlanRow> {
  let updated!: PlanDbRow;
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

      await requirePermission(input.session, 'planner.plan.update', existing.group_id);

      const before: Partial<Record<PlanFieldKey, unknown>> = {};
      const after: Partial<Record<PlanFieldKey, unknown>> = {};
      const changed: PlanFieldKey[] = [];
      const setFields: { name?: string; updated_at: Date; version: number } = {
        updated_at: new Date(),
        version: existing.version + 1,
      };

      if (input.patch.name !== undefined && input.patch.name !== existing.name) {
        before.name = existing.name;
        after.name = input.patch.name;
        setFields.name = input.patch.name;
        changed.push('name');
      }

      const [row] = await tx
        .update(plans)
        .set(setFields)
        // guard: 0 rows ⇒ the row changed since our read (lost-update prevention)
        .where(and(eq(plans.id, input.plan_id), eq(plans.version, input.expected_version)))
        .returning();
      if (!row)
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      updated = row;

      await emitPlannerPlanUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        plan_id: existing.id,
        group_id: existing.group_id,
        before,
        after,
        changed_fields: changed,
        version_before: existing.version,
        version_after: existing.version + 1,
      });
    },
  );

  const categoryDescriptions = await fetchCategoryDescriptions(plannerDb(), updated.id);
  return planRowToDto(updated, categoryDescriptions);
}
