import type { SessionScope } from '@seta/core';
import { requestNotification } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groups, plans } from '../../db/schema.ts';
import { emitPlannerPlanDeleted } from '../../events/emit-helpers.ts';
import { resolveGroupMemberIds } from '../notifications/recipients.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export async function deletePlan(input: {
  plan_id: string;
  expected_version: number;
  session: SessionScope;
}): Promise<void> {
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

      requirePermission(input.session, 'planner.plan.delete', existing.group_id);

      if (existing.version !== input.expected_version) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

      const deletedAt = new Date();
      await tx
        .update(plans)
        .set({ deleted_at: deletedAt, updated_at: new Date(), version: existing.version + 1 })
        .where(eq(plans.id, input.plan_id));

      const [group] = await tx
        .select({ name: groups.name })
        .from(groups)
        .where(eq(groups.id, existing.group_id))
        .limit(1);

      const { eventId } = await emitPlannerPlanDeleted({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        plan_id: existing.id,
        group_id: existing.group_id,
        version_before: existing.version,
        deleted_at: deletedAt.toISOString(),
      });

      const memberIds = await resolveGroupMemberIds(input.session.tenant_id, existing.group_id, tx);
      const recipients = memberIds.filter((u) => u !== input.session.user_id);
      await requestNotification({
        tenant_id: existing.tenant_id,
        event_type: 'planner.plan.deleted',
        user_ids: recipients,
        source_event_id: eventId,
        payload: {
          title: 'Plan deleted',
          body: `Plan "${existing.name}" was deleted${group ? ` from "${group.name}"` : ''}`,
          plan_id: existing.id,
          group_id: existing.group_id,
          actor: { user_id: input.session.user_id, name: input.session.user_id },
        },
      });
    },
  );
}
