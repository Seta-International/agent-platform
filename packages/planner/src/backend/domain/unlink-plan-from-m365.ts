import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerPlanUpdated } from '../../events/emit-helpers.ts';
import type { PlanFieldKey } from '../../events/types.ts';
import { plannerDb } from '../db/index.ts';
import { plans } from '../db/schema.ts';
import type { PlanRow } from '../dto.ts';
import type { UnlinkPlanFromM365Input } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { fetchCategoryDescriptions, planRowToDto } from './_plan-dto.ts';

type PlanDbRow = typeof plans.$inferSelect;

export async function unlinkPlanFromM365(
  input: UnlinkPlanFromM365Input & { session: SessionScope },
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

      await requirePermission(input.session, 'planner.plan.unlink', existing.group_id);

      if (existing.external_source === 'native') {
        throw new PlannerError('PLAN_NOT_LINKED', 'Plan is not linked to any external source', {
          plan_id: input.plan_id,
        });
      }

      const beforeSource = existing.external_source as 'native' | 'm365';
      const beforeId = existing.external_id;
      const beforeEtag = existing.external_etag;
      const beforeSyncedAt = existing.external_synced_at?.toISOString() ?? null;

      const [row] = await tx
        .update(plans)
        .set({
          external_source: 'native',
          external_id: null,
          external_etag: null,
          external_synced_at: null,
          updated_at: new Date(),
          version: existing.version + 1,
        })
        .where(eq(plans.id, input.plan_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
      resultRow = row;

      const before: Partial<Record<PlanFieldKey, unknown>> = {
        external_source: beforeSource,
        external_id: beforeId,
        external_etag: beforeEtag,
        external_synced_at: beforeSyncedAt,
      };
      const after: Partial<Record<PlanFieldKey, unknown>> = {
        external_source: 'native',
        external_id: null,
        external_etag: null,
        external_synced_at: null,
      };
      await emitPlannerPlanUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: existing.group_id,
        plan_id: existing.id,
        before,
        after,
        changed_fields: ['external_source', 'external_id', 'external_etag', 'external_synced_at'],
        version_before: existing.version,
        version_after: existing.version + 1,
      });
    },
  );

  const categoryDescriptions = await fetchCategoryDescriptions(plannerDb(), resultRow.id);
  return planRowToDto(resultRow, categoryDescriptions);
}
