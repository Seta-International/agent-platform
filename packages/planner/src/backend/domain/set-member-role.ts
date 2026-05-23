import { withEmit } from '@seta/core/events';
import { requestNotification } from '@seta/notifications';
import { and, eq, isNull } from 'drizzle-orm';
import { groupMembers, groups } from '../../db/schema.ts';
import { emitPlannerGroupMemberRoleChanged } from '../../events/emit-helpers.ts';
import type { GroupMemberRole } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isM365SystemActor, type PlannerSessionScope } from './_actor.ts';

export async function setMemberRole(input: {
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  session: PlannerSessionScope;
}): Promise<void> {
  requirePermission(input.session, 'planner.group.member.role.set', input.group_id);

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

      const isSystemActor = isM365SystemActor(input.session);
      if (existing.external_source !== 'native' && !isSystemActor) {
        throw new PlannerError(
          'LINKED_GROUP_IMMUTABLE_MEMBERS',
          'Member changes on linked groups are managed in M365',
          { group_id: input.group_id },
        );
      }

      const [member] = await tx
        .select()
        .from(groupMembers)
        .where(
          and(eq(groupMembers.group_id, input.group_id), eq(groupMembers.user_id, input.user_id)),
        )
        .limit(1);
      if (!member) {
        throw new PlannerError('NOT_FOUND', 'Member not in group', {
          group_id: input.group_id,
          user_id: input.user_id,
        });
      }

      const beforeRole = member.role as GroupMemberRole;
      if (beforeRole === input.role) {
        return;
      }

      await tx
        .update(groupMembers)
        .set({ role: input.role })
        .where(
          and(eq(groupMembers.group_id, input.group_id), eq(groupMembers.user_id, input.user_id)),
        );

      const { eventId } = await emitPlannerGroupMemberRoleChanged({
        actor: isSystemActor
          ? { type: 'system', user_id: input.session.user_id, system_id: 'integrations.m365' }
          : { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        group_id: existing.id,
        user_id: input.user_id,
        before_role: beforeRole,
        after_role: input.role,
      });

      const recipients = [input.user_id].filter((u) => u !== input.session.user_id);
      await requestNotification({
        tenant_id: existing.tenant_id,
        event_type: 'planner.group.member.role-changed',
        user_ids: recipients,
        source_event_id: eventId,
        payload: {
          title: 'Group role changed',
          body: `Your role in "${existing.name}" was changed to ${input.role}`,
          group_id: input.group_id,
          actor: { user_id: input.session.user_id, name: input.session.user_id },
        },
      });
    },
  );
}
