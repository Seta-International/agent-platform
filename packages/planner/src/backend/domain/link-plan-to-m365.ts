import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerPlanUpdated } from '../../events/emit-helpers.ts';
import type { PlanFieldKey } from '../../events/types.ts';
import { plannerDb } from '../db/index.ts';
import { groups, plans } from '../db/schema.ts';
import type { PlanRow } from '../dto.ts';
import type { LinkPlanToM365Input } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { fetchCategoryDescriptions, planRowToDto } from './_plan-dto.ts';

type PlanDbRow = typeof plans.$inferSelect;

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

export async function linkPlanToM365(
  input: LinkPlanToM365Input & { session: SessionScope },
): Promise<PlanRow> {
  let resultRow!: PlanDbRow;
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

      await requirePermission(input.session, 'planner.plan.link_m365', existing.group_id);

      if (existing.external_source !== 'native') {
        throw new PlannerError('CONFLICT', 'Plan is already linked to an external source', {
          plan_id: input.plan_id,
          external_source: existing.external_source,
        });
      }

      const [group] = await tx
        .select()
        .from(groups)
        .where(and(eq(groups.id, existing.group_id), isNull(groups.deleted_at)))
        .limit(1);
      if (group?.external_source !== 'm365') {
        throw new PlannerError(
          'GROUP_NOT_LINKED',
          'Parent group must be linked to M365 before linking its plans',
          { plan_id: input.plan_id, group_id: existing.group_id },
        );
      }

      let row: PlanDbRow | undefined;
      const now = new Date();
      try {
        const [r] = await tx
          .update(plans)
          .set({
            external_source: 'm365',
            external_id: input.external_id,
            updated_at: now,
            version: existing.version + 1,
          })
          .where(eq(plans.id, input.plan_id))
          .returning();
        row = r;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new PlannerError(
            'LINKED_DUPLICATE_PLAN',
            'Another plan is already linked to this external_id',
            { plan_id: input.plan_id, external_id: input.external_id },
          );
        }
        throw err;
      }
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
      resultRow = row;

      const before: Partial<Record<PlanFieldKey, unknown>> = {
        external_source: 'native',
        external_id: null,
      };
      const after: Partial<Record<PlanFieldKey, unknown>> = {
        external_source: 'm365',
        external_id: input.external_id,
      };
      await emitPlannerPlanUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: existing.group_id,
        plan_id: existing.id,
        before,
        after,
        changed_fields: ['external_source', 'external_id'],
        version_before: existing.version,
        version_after: existing.version + 1,
      });
    },
  );

  const categoryDescriptions = await fetchCategoryDescriptions(plannerDb(), resultRow.id);
  return planRowToDto(resultRow, categoryDescriptions);
}
