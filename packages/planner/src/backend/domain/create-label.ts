import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { labels, plans } from '../../db/schema.ts';
import { emitPlannerLabelCreated } from '../../events/emit-helpers.ts';
import type { LabelRow } from '../dto.ts';
import type { CreateLabelInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type LabelDbRow = typeof labels.$inferSelect;

export async function createLabel(
  input: CreateLabelInput & { session: SessionScope },
): Promise<LabelRow> {
  let inserted!: LabelDbRow;

  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [plan] = await tx
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
        .limit(1);
      if (!plan) throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
      if (plan.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
          plan_id: input.plan_id,
        });
      }

      requirePermission(input.session, 'planner.plan.update', plan.group_id);

      const [row] = await tx
        .insert(labels)
        .values({
          tenant_id: plan.tenant_id,
          plan_id: input.plan_id,
          name: input.name,
          color: input.color,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      await emitPlannerLabelCreated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: plan.tenant_id,
        after: {
          label_id: row.id,
          plan_id: input.plan_id,
          group_id: plan.group_id,
          name: row.name,
          color: row.color,
        },
      });
    },
  );

  return rowToDto(inserted);
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
