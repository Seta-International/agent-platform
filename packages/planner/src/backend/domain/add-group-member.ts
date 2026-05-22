import { requestNotification } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groupMembers, groups } from '../../db/schema.ts';
import { emitPlannerGroupMemberAdded } from '../../events/emit-helpers.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isM365SystemActor, type PlannerSessionScope } from './_actor.ts';

export async function addGroupMember(input: {
  group_id: string;
  user_id: string;
  session: PlannerSessionScope;
}): Promise<void> {
  requirePermission(input.session, 'planner.group.member.write', input.group_id);

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
      if (existing.external_source !== 'native' && !isM365SystemActor(input.session)) {
        throw new PlannerError(
          'LINKED_GROUP_IMMUTABLE_MEMBERS',
          'Member changes on linked groups are managed in M365',
          { group_id: input.group_id },
        );
      }

      const inserted = await tx
        .insert(groupMembers)
        .values({
          group_id: input.group_id,
          user_id: input.user_id,
          added_by: input.session.user_id,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length > 0) {
        const isSystemActor = isM365SystemActor(input.session);
        const { eventId } = await emitPlannerGroupMemberAdded({
          actor: isSystemActor
            ? { type: 'system', user_id: input.session.user_id, system_id: 'integrations.m365' }
            : { type: 'user', user_id: input.session.user_id },
          tenant_id: existing.tenant_id,
          group_id: existing.id,
          user_id: input.user_id,
        });

        const recipients = [input.user_id].filter((u) => u !== input.session.user_id);
        await requestNotification({
          tenant_id: existing.tenant_id,
          event_type: 'planner.group.member.added',
          user_ids: recipients,
          source_event_id: eventId,
          payload: {
            title: 'Added to group',
            body: `You were added to "${existing.name}"`,
            group_id: input.group_id,
            actor: { user_id: input.session.user_id, name: input.session.user_id },
          },
        });
      }
    },
  );
}
