import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerPlanCreated } from '../../events/emit-helpers.ts';
import { plannerDb } from '../db/index.ts';
import { groups, plans } from '../db/schema.ts';
import type { PlanRow } from '../dto.ts';
import type { CreatePlanInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isM365SystemActor } from './_actor.ts';
import { fetchCategoryDescriptions, planRowToDto } from './_plan-dto.ts';

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

      await requirePermission(input.session, 'planner.plan.create', input.group_id);

      // external_* mark a plan as M365-origin and are reserved for the M365
      // system actor (the auto-mirror pull). A user-supplied value would let a
      // native plan masquerade as already-synced and dodge the push.
      const touchesExternal =
        input.external_source !== undefined || input.external_id !== undefined;
      const isSystemActor = isM365SystemActor(input.session);
      if (touchesExternal && !isSystemActor) {
        throw new PlannerError(
          'RESERVED_FOR_SYSTEM_ACTOR',
          'external_* fields writable only by M365 system actor',
          { group_id: input.group_id },
        );
      }

      const [row] = await tx
        .insert(plans)
        .values({
          tenant_id: group.tenant_id,
          group_id: input.group_id,
          name: input.name,
          created_by: input.session.user_id,
          ...(input.external_source !== undefined
            ? { external_source: input.external_source }
            : {}),
          ...(input.external_id !== undefined ? { external_id: input.external_id } : {}),
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      await emitPlannerPlanCreated({
        // Attribute M365-originated creates to the system actor so the M365
        // push subscriber's echo guard suppresses a re-push (push↔pull loop).
        actor: isSystemActor
          ? { type: 'system', user_id: null, system_id: 'integrations.m365' }
          : { type: 'user', user_id: input.session.user_id },
        tenant_id: group.tenant_id,
        after: {
          plan_id: row.id,
          group_id: row.group_id,
          name: row.name,
          created_by: row.created_by,
          external_source: row.external_source as 'native' | 'm365',
          external_id: row.external_id,
        },
      });
    },
  );

  const categoryDescriptions = await fetchCategoryDescriptions(plannerDb(), inserted.id);
  return planRowToDto(inserted, categoryDescriptions);
}
