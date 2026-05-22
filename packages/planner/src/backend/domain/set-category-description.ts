import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import type { NodeTx } from '@seta/shared-types';
import { and, eq, isNull } from 'drizzle-orm';
import { plans } from '../../db/schema.ts';
import { emitPlannerPlanCategoryDescriptionChanged } from '../../events/emit-helpers.ts';
import type { PlanRow, TaskExternalSource } from '../dto.ts';
import type { SetCategoryDescriptionInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type PlanDbRow = typeof plans.$inferSelect;

function rowToDto(row: PlanDbRow): PlanRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    group_id: row.group_id,
    name: row.name,
    category_descriptions: (row.category_descriptions ?? {}) as Record<string, string>,
    external_source: row.external_source as TaskExternalSource,
    external_id: row.external_id,
    external_etag: row.external_etag,
    external_synced_at: row.external_synced_at?.toISOString() ?? null,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at?.toISOString() ?? null,
    version: row.version,
  };
}

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
      return rowToDto(updated);
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

  requirePermission(input.session, 'planner.plan.update', existing.group_id);

  const key = `category${input.slot}`;
  const currentMap = (existing.category_descriptions ?? {}) as Record<string, string>;
  const beforeVal: string | null = currentMap[key] ?? null;

  if (input.name === undefined) {
    return existing;
  }

  const afterVal: string | null = input.name;
  if (beforeVal === afterVal) {
    return existing;
  }

  const nextMap: Record<string, string> = { ...currentMap };
  if (afterVal === null) {
    delete nextMap[key];
  } else {
    nextMap[key] = afterVal;
  }

  const [row] = await tx
    .update(plans)
    .set({
      category_descriptions: nextMap,
      updated_at: new Date(),
      version: existing.version + 1,
    })
    .where(eq(plans.id, input.plan_id))
    .returning();
  if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');

  await emitPlannerPlanCategoryDescriptionChanged({
    actor: { type: 'user', user_id: input.session.user_id },
    tenant_id: existing.tenant_id,
    plan_id: existing.id,
    slot: input.slot,
    before: beforeVal,
    after: afterVal,
  });

  return row;
}
