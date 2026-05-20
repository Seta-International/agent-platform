import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groups } from '../../db/schema.ts';
import { emitPlannerGroupDeleted } from '../../events/emit-helpers.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function deleteGroup(input: {
  group_id: string;
  expected_version: number;
  session: SessionScope;
}): Promise<void> {
  requirePermission(input.session, 'planner.group.delete', input.group_id);

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

      const deletedAt = new Date();
      await tx
        .update(groups)
        .set({ deleted_at: deletedAt, updated_at: new Date(), version: existing.version + 1 })
        .where(eq(groups.id, input.group_id));

      await emitPlannerGroupDeleted({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: existing.id,
        version_before: existing.version,
        deleted_at: deletedAt.toISOString(),
      });
    },
  );
}
