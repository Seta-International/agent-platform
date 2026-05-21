import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groups } from '../../db/schema.ts';
import { emitPlannerGroupUpdated } from '../../events/emit-helpers.ts';
import type { GroupFieldKey } from '../../events/types.ts';
import type { GroupRow } from '../dto.ts';
import type { UpdateGroupPatch } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isM365SystemActor, type PlannerSessionScope } from './_actor.ts';
import { groupRowToDto } from './_group-dto.ts';

type GroupDbRow = typeof groups.$inferSelect;

const UPDATABLE_FIELDS = [
  'name',
  'description',
  'theme',
  'visibility',
  'default_role',
] as const satisfies readonly GroupFieldKey[];

type UpdatableField = (typeof UPDATABLE_FIELDS)[number];

export async function updateGroup(input: {
  group_id: string;
  expected_version: number;
  patch: UpdateGroupPatch;
  session: PlannerSessionScope;
}): Promise<GroupRow> {
  requirePermission(input.session, 'planner.group.update', input.group_id);

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
      if (existing.version !== input.expected_version) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

      const before: Partial<Record<UpdatableField, unknown>> = {};
      const after: Partial<Record<UpdatableField, unknown>> = {};
      const changed_fields: GroupFieldKey[] = [];
      const setFields: {
        name?: string;
        description?: string | null;
        theme?: string;
        visibility?: string;
        default_role?: string;
      } = {};

      for (const field of UPDATABLE_FIELDS) {
        if (!(field in input.patch)) continue;
        const next = input.patch[field];
        if (next === undefined) continue;
        const current = existing[field];
        if (next === current) continue;
        before[field] = current;
        after[field] = next;
        changed_fields.push(field);
        if (field === 'description') {
          setFields.description = next;
        } else if (next !== null) {
          setFields[field] = next;
        }
      }

      if (changed_fields.length === 0) {
        resultRow = existing;
        return;
      }

      const [row] = await tx
        .update(groups)
        .set({
          ...setFields,
          updated_at: new Date(),
          version: existing.version + 1,
        })
        .where(eq(groups.id, input.group_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
      resultRow = row;

      const isSystemActor = isM365SystemActor(input.session);
      await emitPlannerGroupUpdated({
        actor: isSystemActor
          ? { type: 'system', user_id: input.session.user_id, system_id: 'integrations.m365' }
          : { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: existing.id,
        before,
        after,
        changed_fields,
        version_before: existing.version,
        version_after: existing.version + 1,
      });
    },
  );

  return groupRowToDto(resultRow);
}
