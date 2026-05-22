import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { plans } from '../../db/schema.ts';
import { emitPlannerPlanUpdated } from '../../events/emit-helpers.ts';
import type { PlanFieldKey } from '../../events/types.ts';
import type { PlanRow } from '../dto.ts';
import type { UpdatePlanPatch } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

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

      requirePermission(input.session, 'planner.plan.update', existing.group_id);

      if (existing.version !== input.expected_version) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

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
        .where(eq(plans.id, input.plan_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
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

  return rowToDto(updated);
}

function rowToDto(row: PlanDbRow): PlanRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    group_id: row.group_id,
    name: row.name,
    category_descriptions: (row.category_descriptions ?? {}) as Record<string, string>,
    external_source: row.external_source as 'native' | 'm365',
    external_id: row.external_id,
    external_etag: row.external_etag,
    external_synced_at: row.external_synced_at ? row.external_synced_at.toISOString() : null,
    sync_status: row.sync_status as PlanRow['sync_status'],
    last_error: row.last_error,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    version: row.version,
  };
}
