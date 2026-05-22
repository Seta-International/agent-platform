import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groups, plans } from '../../db/schema.ts';
import { emitPlannerPlanUpdated } from '../../events/emit-helpers.ts';
import type { PlanFieldKey } from '../../events/types.ts';
import type { PlanRow } from '../dto.ts';
import type { LinkPlanToM365Input } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

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

      requirePermission(input.session, 'planner.plan.link.m365', existing.group_id);

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
      if (!group || group.external_source !== 'm365') {
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

  return rowToDto(resultRow);
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
