import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groups } from '../../db/schema.ts';
import type { MarkGroupSyncStatusInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isM365SystemActor, type PlannerSessionScope } from './_actor.ts';

export async function markGroupSyncStatus(
  input: MarkGroupSyncStatusInput & { session: PlannerSessionScope },
): Promise<void> {
  requirePermission(input.session, 'planner.group.sync.mark-status', input.group_id);

  if (!isM365SystemActor(input.session)) {
    throw new PlannerError(
      'FORBIDDEN',
      'markGroupSyncStatus is callable only by the M365 system actor',
      { group_id: input.group_id },
    );
  }

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

      await tx
        .update(groups)
        .set({ external_synced_at: new Date(input.external_synced_at) })
        .where(eq(groups.id, input.group_id));
    },
  );
}
