import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groups } from '../../db/schema.ts';
import { emitPlannerGroupUpdated } from '../../events/emit-helpers.ts';
import type { GroupRow } from '../dto.ts';
import type { LinkGroupToM365Input } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupRowToDto } from './_group-dto.ts';

type GroupDbRow = typeof groups.$inferSelect;

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

export async function linkGroupToM365(
  input: LinkGroupToM365Input & { session: SessionScope },
): Promise<GroupRow> {
  requirePermission(input.session, 'planner.group.link.m365', input.group_id);

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
      if (existing.external_source !== 'native') {
        throw new PlannerError('CONFLICT', 'Group is already linked to an external source', {
          group_id: input.group_id,
          external_source: existing.external_source,
        });
      }

      let row: GroupDbRow | undefined;
      try {
        const [r] = await tx
          .update(groups)
          .set({
            external_source: 'm365',
            external_id: input.external_id,
            updated_at: new Date(),
            version: existing.version + 1,
          })
          .where(eq(groups.id, input.group_id))
          .returning();
        row = r;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new PlannerError(
            'LINKED_DUPLICATE',
            'Another group is already linked to this external_id',
            { group_id: input.group_id, external_id: input.external_id },
          );
        }
        throw err;
      }
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
      resultRow = row;

      await emitPlannerGroupUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: existing.id,
        before: { external_source: 'native', external_id: null },
        after: { external_source: 'm365', external_id: input.external_id },
        changed_fields: ['external_source', 'external_id'],
        version_before: existing.version,
        version_after: existing.version + 1,
      });
    },
  );

  return groupRowToDto(resultRow);
}
