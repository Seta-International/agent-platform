import { hashRoleSummary } from '@seta/core';
import type { TaskList } from 'graphile-worker';
import { addGroupMember } from '../domain/add-group-member.ts';

export type BulkAddGroupMembersPayload = {
  group_id: string;
  user_ids: string[];
  actor_user_id: string;
  actor_tenant_id: string;
};

// Permission was validated at enqueue time; use an org.admin synthetic session
// so the RBAC check in addGroupMember passes without storing the full session scope.
export const plannerMembershipJobs: TaskList = {
  'planner.bulk_add_group_members': async (rawPayload) => {
    const payload = rawPayload as BulkAddGroupMembersPayload;
    const role_summary = { roles: ['org.admin'] as string[], cross_tenant_read: false };
    const session = {
      session_id: crypto.randomUUID(),
      user_id: payload.actor_user_id,
      tenant_id: payload.actor_tenant_id,
      email: '',
      display_name: '',
      role_summary,
      role_summary_hash: hashRoleSummary(role_summary),
      accessible_group_ids: [] as readonly string[],
      cross_tenant_read: false,
      built_at: new Date(),
      invalidated_at: null,
    };
    for (const user_id of payload.user_ids) {
      // swallow per-user errors (already a member, group deleted mid-job, etc.)
      await addGroupMember({ group_id: payload.group_id, user_id, session }).catch(() => {});
    }
  },
};
