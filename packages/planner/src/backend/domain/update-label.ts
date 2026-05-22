import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { labels, plans } from '../../db/schema.ts';
import { emitPlannerLabelUpdated } from '../../events/emit-helpers.ts';
import type { LabelRow } from '../dto.ts';
import type { UpdateLabelPatch } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type LabelDbRow = typeof labels.$inferSelect;

export async function updateLabel(input: {
  label_id: string;
  patch: UpdateLabelPatch;
  session: SessionScope;
}): Promise<LabelRow> {
  let result!: LabelDbRow;

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
        .from(labels)
        .where(and(eq(labels.id, input.label_id), isNull(labels.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Label not found', { label_id: input.label_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Label belongs to another tenant', {
          label_id: input.label_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, existing.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: existing.plan_id });

      requirePermission(input.session, 'planner.plan.update', plan.group_id);

      const before: Partial<{ name: string; color: string }> = {};
      const after: Partial<{ name: string; color: string }> = {};
      const setFields: { name?: string; color?: string } = {};

      if (input.patch.name !== undefined && input.patch.name !== existing.name) {
        before.name = existing.name;
        after.name = input.patch.name;
        setFields.name = input.patch.name;
      }

      if (input.patch.color !== undefined && input.patch.color !== existing.color) {
        before.color = existing.color;
        after.color = input.patch.color;
        setFields.color = input.patch.color;
      }

      if (Object.keys(after).length === 0) {
        result = existing;
        return;
      }

      const [row] = await tx
        .update(labels)
        .set(setFields)
        .where(eq(labels.id, input.label_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
      result = row;

      await emitPlannerLabelUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: plan.group_id,
        label_id: existing.id,
        plan_id: existing.plan_id,
        before,
        after,
      });
    },
  );

  return rowToDto(result);
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
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}
