import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import type { NodeTx } from '@seta/shared-types';
import { and, eq, isNull } from 'drizzle-orm';
import { labels, plans } from '../../db/schema.ts';
import { emitPlannerLabelCategorySlotChanged } from '../../events/emit-helpers.ts';
import type { LabelRow } from '../dto.ts';
import type { AttachLabelToCategorySlotInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type LabelDbRow = typeof labels.$inferSelect;

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if ('code' in err && (err as { code: unknown }).code === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    (cause as { code: unknown }).code === '23505'
  ) {
    return true;
  }
  return false;
}

function rowToDto(row: LabelDbRow): LabelRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_id: row.plan_id,
    name: row.name,
    color: row.color,
    category_slot: row.category_slot,
    created_at: row.created_at.toISOString(),
    deleted_at: row.deleted_at?.toISOString() ?? null,
  };
}

export async function attachLabelToCategorySlot(
  input: AttachLabelToCategorySlotInput & { session: SessionScope },
): Promise<LabelRow> {
  return withSpan(
    'planner.label.attach-category-slot',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.plan_id': input.plan_id,
    },
    async () => {
      let result!: LabelDbRow;
      await withEmit(
        {
          actor: {
            userId: input.session.user_id,
            tenantId: input.session.tenant_id,
          },
        },
        async (tx) => {
          result = await attachLabelToCategorySlotTx(tx, input);
        },
      );
      return rowToDto(result);
    },
  );
}

export async function attachLabelToCategorySlotTx(
  tx: NodeTx,
  input: AttachLabelToCategorySlotInput & { session: SessionScope },
): Promise<LabelDbRow> {
  if (input.slot !== null && (!Number.isInteger(input.slot) || input.slot < 1 || input.slot > 25)) {
    throw new PlannerError('CATEGORY_SLOT_OUT_OF_RANGE', 'Category slot must be between 1 and 25', {
      plan_id: input.plan_id,
      label_id: input.label_id,
      slot: input.slot,
    });
  }

  const [existing] = await tx
    .select()
    .from(labels)
    .where(and(eq(labels.id, input.label_id), isNull(labels.deleted_at)))
    .limit(1);
  if (!existing) {
    throw new PlannerError('NOT_FOUND', 'Label not found', { label_id: input.label_id });
  }
  if (existing.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Label belongs to another tenant', {
      label_id: input.label_id,
    });
  }
  if (existing.plan_id !== input.plan_id) {
    throw new PlannerError('VALIDATION', 'Label belongs to a different plan', {
      label_id: input.label_id,
      label_plan_id: existing.plan_id,
      plan_id: input.plan_id,
    });
  }

  const [plan] = await tx
    .select()
    .from(plans)
    .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
    .limit(1);
  if (!plan) {
    throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
  }
  if (plan.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
      plan_id: input.plan_id,
    });
  }

  requirePermission(input.session, 'planner.plan.update', plan.group_id);

  const beforeSlot = existing.category_slot;

  let row: LabelDbRow | undefined;
  try {
    const updated = await tx
      .update(labels)
      .set({ category_slot: input.slot })
      .where(and(eq(labels.id, input.label_id), eq(labels.plan_id, input.plan_id)))
      .returning();
    row = updated[0];
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new PlannerError('CONFLICT', 'Slot already taken', {
        plan_id: input.plan_id,
        slot: input.slot,
      });
    }
    throw err;
  }
  if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');

  await emitPlannerLabelCategorySlotChanged({
    actor: { type: 'user', user_id: input.session.user_id },
    tenant_id: existing.tenant_id,
    plan_id: existing.plan_id,
    label_id: existing.id,
    before: beforeSlot,
    after: input.slot,
  });

  return row;
}
