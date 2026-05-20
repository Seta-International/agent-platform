import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { groups } from '../../db/schema.ts';
import { emitPlannerGroupCreated } from '../../events/emit-helpers.ts';
import type { GroupRow } from '../dto.ts';
import type { CreateGroupInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type GroupDbRow = typeof groups.$inferSelect;

export async function createGroup(
  input: CreateGroupInput & { session: SessionScope },
): Promise<GroupRow> {
  requirePermission(input.session, 'planner.group.create');
  if (input.session.tenant_id !== input.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Cannot create group in another tenant', {
      session_tenant_id: input.session.tenant_id,
      input_tenant_id: input.tenant_id,
    });
  }

  let inserted!: GroupDbRow;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.tenant_id,
      },
    },
    async (tx) => {
      const [row] = await tx
        .insert(groups)
        .values({
          tenant_id: input.tenant_id,
          name: input.name,
          created_by: input.session.user_id,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      await emitPlannerGroupCreated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: input.tenant_id,
        after: {
          group_id: row.id,
          tenant_id: row.tenant_id,
          name: row.name,
          account_id: row.account_id,
          created_by: row.created_by,
        },
      });
    },
  );

  return rowToDto(inserted);
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
