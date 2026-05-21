import type { GroupMemberRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useSetMemberRole(groupId: string) {
  return useOptimisticMutation<{ user_id: string; role: 'owner' | 'member' }, void>({
    mutationFn: (v) =>
      plannerClient.setMemberRole({ group_id: groupId, user_id: v.user_id, role: v.role }),
    snapshot: (_v, qc) => [
      {
        key: plannerKeys.groupMembers(groupId),
        prev: qc.getQueryData(plannerKeys.groupMembers(groupId)),
      },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<GroupMemberRow[]>(plannerKeys.groupMembers(groupId), (prev) =>
        (prev ?? []).map((m) => (m.user_id === v.user_id ? { ...m, role: v.role } : m)),
      );
    },
    onServerOk: () => {},
    savingId: (v) => `${groupId}:${v.user_id}:role`,
    invalidate: () => [plannerKeys.groupMembers(groupId)],
    errorMessage: () => "Couldn't update member role.",
  });
}
