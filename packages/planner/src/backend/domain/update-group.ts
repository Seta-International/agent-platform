import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groups } from '../../db/schema.ts';
import { emitPlannerGroupUpdated } from '../../events/emit-helpers.ts';
import type { GroupRow } from '../dto.ts';
import type { UpdateGroupPatch } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type GroupDbRow = typeof groups.$inferSelect;

export async function updateGroup(input: {
  group_id: string;
  expected_version: number;
  patch: UpdateGroupPatch;
  session: SessionScope;
}): Promise<GroupRow> {
  requirePermission(input.session, 'planner.group.update', input.group_id);

  let updated!: GroupDbRow;
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
      if (existing.version !== input.expected_version) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

      const before: Partial<{ name: string }> = {};
      const after: Partial<{ name: string }> = {};
      const setFields: { name?: string; updated_at: Date; version: number } = {
        updated_at: new Date(),
        version: existing.version + 1,
      };

      if (input.patch.name !== undefined && input.patch.name !== existing.name) {
        before.name = existing.name;
        after.name = input.patch.name;
        setFields.name = input.patch.name;
      }

      const [row] = await tx
        .update(groups)
        .set(setFields)
        .where(eq(groups.id, input.group_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
      updated = row;

      await emitPlannerGroupUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: existing.id,
        before,
        after,
        version_before: existing.version,
        version_after: existing.version + 1,
      });
    },
  );

  return rowToDto(updated);
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
