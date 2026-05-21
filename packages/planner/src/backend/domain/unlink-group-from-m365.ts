import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groups } from '../../db/schema.ts';
import { emitPlannerGroupUpdated } from '../../events/emit-helpers.ts';
import type { GroupExternalSource, GroupRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupRowToDto } from './_group-dto.ts';

type GroupDbRow = typeof groups.$inferSelect;

export async function unlinkGroupFromM365(input: {
  group_id: string;
  session: SessionScope;
}): Promise<GroupRow> {
  requirePermission(input.session, 'planner.group.unlink', input.group_id);

  let resultRow!: GroupDbRow;
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
        .from(groups)
        .where(and(eq(groups.id, input.group_id), isNull(groups.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Group not found', { group_id: input.group_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Group belongs to another tenant', {
          group_id: input.group_id,
        });
      }
      if (existing.external_source === 'native') {
        throw new PlannerError('CONFLICT', 'Group is not linked to any external source', {
          group_id: input.group_id,
        });
      }

      const beforeSource = existing.external_source as GroupExternalSource;
      const beforeId = existing.external_id;

      const [row] = await tx
        .update(groups)
        .set({
          external_source: 'native',
          external_id: null,
          updated_at: new Date(),
          version: existing.version + 1,
        })
        .where(eq(groups.id, input.group_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
      resultRow = row;

      await emitPlannerGroupUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: existing.id,
        before: { external_source: beforeSource, external_id: beforeId },
        after: { external_source: 'native', external_id: null },
        changed_fields: ['external_source', 'external_id'],
        version_before: existing.version,
        version_after: existing.version + 1,
      });
    },
  );

  return groupRowToDto(resultRow);
}
