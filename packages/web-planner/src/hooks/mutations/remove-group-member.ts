import type { GroupMemberRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface PageShape {
  members: GroupMemberRow[];
  total: number;
}

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
      qc.setQueryData<PageShape>(plannerKeys.groupMembers(groupId), (old) => {
        if (!old) return old;
        return {
          ...old,
          members: old.members.filter((m) => m.user_id !== v.user_id),
          total: old.total - 1,
        };
      });
    },
    onServerOk: () => {},
    savingId: (v) => `${groupId}:${v.user_id}`,
    invalidate: () => [plannerKeys.groupMembers(groupId)],
    errorMessage: () => "Couldn't remove member.",
  });
}
