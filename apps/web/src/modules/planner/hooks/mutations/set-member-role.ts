import type { GroupMemberRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface PageShape {
  pages: Array<{ members: GroupMemberRow[]; total: number }>;
  pageParams: unknown[];
}

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
      qc.setQueryData<PageShape>(plannerKeys.groupMembers(groupId), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            members: p.members.map((m) => (m.user_id === v.user_id ? { ...m, role: v.role } : m)),
          })),
        };
      });
    },
    onServerOk: () => {},
    savingId: (v) => `${groupId}:${v.user_id}:role`,
    invalidate: () => [plannerKeys.groupMembers(groupId)],
    errorMessage: () => "Couldn't update member role.",
  });
}
