import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groups, plans } from '../../db/schema.ts';
import { emitPlannerPlanCreated } from '../../events/emit-helpers.ts';
import type { PlanRow } from '../dto.ts';
import type { CreatePlanInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type PlanDbRow = typeof plans.$inferSelect;

export async function createPlan(
  input: CreatePlanInput & { session: SessionScope },
): Promise<PlanRow> {
  let inserted!: PlanDbRow;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [group] = await tx
        .select()
        .from(groups)
        .where(and(eq(groups.id, input.group_id), isNull(groups.deleted_at)))
        .limit(1);
      if (!group)
        throw new PlannerError('NOT_FOUND', 'Group not found', { group_id: input.group_id });
      if (group.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Group belongs to another tenant', {
          group_id: input.group_id,
        });
      }

      requirePermission(input.session, 'planner.plan.create', input.group_id);

      const [row] = await tx
        .insert(plans)
        .values({
          tenant_id: group.tenant_id,
          group_id: input.group_id,
          name: input.name,
          created_by: input.session.user_id,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      await emitPlannerPlanCreated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: group.tenant_id,
        after: {
          plan_id: row.id,
          group_id: row.group_id,
          name: row.name,
          created_by: row.created_by,
        },
      });
    },
  );

  return rowToDto(inserted);
}

function rowToDto(row: PlanDbRow): PlanRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    group_id: row.group_id,
    name: row.name,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    version: row.version,
  };
}
