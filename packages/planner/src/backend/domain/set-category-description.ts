import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import type { NodeTx } from '@seta/shared-db';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerPlanCategoryDescriptionChanged } from '../../events/emit-helpers.ts';
import { plannerDb } from '../db/index.ts';
import { planCategories, plans } from '../db/schema.ts';
import type { PlanRow } from '../dto.ts';
import type { SetCategoryDescriptionInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { fetchCategoryDescriptions, planRowToDto } from './_plan-dto.ts';

type PlanDbRow = typeof plans.$inferSelect;

export async function setCategoryDescription(
  input: SetCategoryDescriptionInput & { session: SessionScope },
): Promise<PlanRow> {
  return withSpan(
    'planner.plan.set-category-description',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.plan_id': input.plan_id,
    },
    async () => {
      let updated!: PlanDbRow;
      await withEmit(
        {
          actor: {
            userId: input.session.user_id,
            tenantId: input.session.tenant_id,
          },
        },
        async (tx) => {
          updated = await setCategoryDescriptionTx(tx, input);
        },
      );
      const categoryDescriptions = await fetchCategoryDescriptions(plannerDb(), updated.id);
      return planRowToDto(updated, categoryDescriptions);
    },
  );
}

export async function setCategoryDescriptionTx(
  tx: NodeTx,
  input: SetCategoryDescriptionInput & { session: SessionScope },
): Promise<PlanDbRow> {
  if (!Number.isInteger(input.slot) || input.slot < 1 || input.slot > 25) {
    throw new PlannerError('CATEGORY_SLOT_OUT_OF_RANGE', 'Category slot must be between 1 and 25', {
      plan_id: input.plan_id,
      slot: input.slot,
    });
  }
  if (typeof input.name === 'string' && input.name.length > 100) {
    throw new PlannerError('VALIDATION', 'Category description must be 100 characters or fewer', {
      plan_id: input.plan_id,
      slot: input.slot,
      length: input.name.length,
    });
  }

  const [existing] = await tx
    .select()
    .from(plans)
    .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
    .limit(1);
  if (!existing) {
    throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
  }
  if (existing.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
      plan_id: input.plan_id,
    });
  }

  await requirePermission(input.session, 'planner.plan.update', existing.group_id);

  const slotCondition = and(
    eq(planCategories.tenant_id, existing.tenant_id),
    eq(planCategories.plan_id, input.plan_id),
    eq(planCategories.slot, input.slot),
  );
  const [existingCategory] = await tx
    .select({ name: planCategories.name })
    .from(planCategories)
    .where(slotCondition)
    .limit(1);
  const beforeVal: string | null = existingCategory?.name ?? null;

  if (input.name === undefined) {
    return existing;
  }

  const afterVal: string | null = input.name;
  if (beforeVal === afterVal) {
    return existing;
  }

  if (afterVal === null) {
    await tx.delete(planCategories).where(slotCondition);
  } else {
    await tx
      .insert(planCategories)
      .values({
        tenant_id: existing.tenant_id,
        plan_id: input.plan_id,
        slot: input.slot,
        name: afterVal,
      })
      .onConflictDoUpdate({
        target: [planCategories.tenant_id, planCategories.plan_id, planCategories.slot],
        set: { name: afterVal, updated_at: new Date() },
      });
  }

  const [row] = await tx
    .update(plans)
    .set({
      updated_at: new Date(),
      version: existing.version + 1,
    })
    .where(eq(plans.id, input.plan_id))
    .returning();
  if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');

  await emitPlannerPlanCategoryDescriptionChanged({
    actor: { type: 'user', user_id: input.session.user_id },
    tenant_id: existing.tenant_id,
    group_id: existing.group_id,
    plan_id: existing.id,
    slot: input.slot,
    before: beforeVal,
    after: afterVal,
  });

  return row;
}
