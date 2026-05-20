import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { groups } from '../../db/schema.ts';
import { emitPlannerGroupRestored } from '../../events/emit-helpers.ts';
import type { GroupRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type GroupDbRow = typeof groups.$inferSelect;

export async function restoreGroup(input: {
  group_id: string;
  session: SessionScope;
}): Promise<GroupRow> {
  requirePermission(input.session, 'planner.group.update', input.group_id);

  let restored!: GroupDbRow;
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
        .where(eq(groups.id, input.group_id))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Group not found', { group_id: input.group_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Group belongs to another tenant', {
          group_id: input.group_id,
        });
      }
      if (existing.deleted_at === null) {
        throw new PlannerError('VALIDATION', 'Group is not deleted');
      }

      const [row] = await tx
        .update(groups)
        .set({ deleted_at: null, updated_at: new Date(), version: existing.version + 1 })
        .where(eq(groups.id, input.group_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Restore returned no row');
      restored = row;

      await emitPlannerGroupRestored({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: existing.id,
        version_after: existing.version + 1,
      });
    },
  );

  return rowToDto(restored);
}

function rowToDto(row: GroupDbRow): GroupRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    account_id: row.account_id,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    version: row.version,
  };
}
