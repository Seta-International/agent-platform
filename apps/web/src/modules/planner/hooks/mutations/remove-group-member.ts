import type { GroupMemberRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useRemoveGroupMember(groupId: string) {
  return useOptimisticMutation<{ user_id: string }, void>({
    mutationFn: (v) => plannerClient.removeGroupMember({ group_id: groupId, user_id: v.user_id }),
    snapshot: (_v, qc) => [
      {
        key: plannerKeys.groupMembers(groupId),
        prev: qc.getQueryData(plannerKeys.groupMembers(groupId)),
      },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<GroupMemberRow[]>(plannerKeys.groupMembers(groupId), (prev) =>
        (prev ?? []).filter((m) => m.user_id !== v.user_id),
      );
    },
    onServerOk: () => {},
    savingId: (v) => `${groupId}:${v.user_id}`,
    invalidate: () => [plannerKeys.groupMembers(groupId)],
    errorMessage: () => "Couldn't remove member.",
  });
}
