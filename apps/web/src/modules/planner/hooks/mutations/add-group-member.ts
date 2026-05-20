import type { GroupMemberRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useAddGroupMember(groupId: string) {
  return useOptimisticMutation<{ user_id: string; display_name?: string; email?: string }, void>({
    mutationFn: (v) => plannerClient.addGroupMember({ group_id: groupId, user_id: v.user_id }),
    snapshot: (_v, qc) => [
      {
        key: plannerKeys.groupMembers(groupId),
        prev: qc.getQueryData(plannerKeys.groupMembers(groupId)),
      },
    ],
    applyOptimistic: (v, qc) => {
      const now = new Date().toISOString();
      const optimistic: GroupMemberRow = {
        group_id: groupId,
        user_id: v.user_id,
        display_name: v.display_name ?? '',
        email: v.email ?? '',
        added_at: now,
        added_by: '',
      };
      qc.setQueryData<GroupMemberRow[]>(plannerKeys.groupMembers(groupId), (prev) => [
        ...(prev ?? []),
        optimistic,
      ]);
    },
    onServerOk: () => {},
    savingId: (v) => `${groupId}:${v.user_id}`,
    invalidate: () => [plannerKeys.groupMembers(groupId)],
    errorMessage: () => "Couldn't add member.",
  });
}
