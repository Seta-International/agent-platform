import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { emitPlannerGroupCreated } from '../../events/emit-helpers.ts';
import { groupMembers, groups } from '../db/schema.ts';
import type { GroupRow } from '../dto.ts';
import type { CreateGroupInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupRowToDto } from './_group-dto.ts';

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
          description: input.description ?? null,
          theme: input.theme ?? 'blue',
          visibility: input.visibility ?? 'private',
          default_role: input.default_role ?? 'member',
          created_by: input.session.user_id,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      // Always insert creator as owner; caller-supplied initial_members append after.
      // onConflictDoNothing deduplicates if caller also listed the creator.
      const membersToInsert = [
        { user_id: input.session.user_id, role: 'owner' as const },
        ...(input.initial_members ?? []),
      ];
      await tx
        .insert(groupMembers)
        .values(
          membersToInsert.map((m) => ({
            group_id: row.id,
            user_id: m.user_id,
            role: m.role,
            added_by: input.session.user_id,
          })),
        )
        .onConflictDoNothing();

      await emitPlannerGroupCreated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: input.tenant_id,
        after: {
          group_id: row.id,
          tenant_id: row.tenant_id,
          name: row.name,
          description: row.description,
          theme: row.theme as GroupRow['theme'],
          visibility: row.visibility as GroupRow['visibility'],
          default_role: row.default_role as GroupRow['default_role'],
          external_source: row.external_source as GroupRow['external_source'],
          external_id: row.external_id,
          account_id: row.account_id,
          created_by: row.created_by,
        },
      });
    },
  );

  return groupRowToDto(inserted);
}
