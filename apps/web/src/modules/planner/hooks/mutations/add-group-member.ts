import type { GroupMemberRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface PageShape {
  pages: Array<{ members: GroupMemberRow[]; total: number }>;
  pageParams: unknown[];
}

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
        role: 'member',
        display_name: v.display_name ?? '',
        email: v.email ?? '',
        added_at: now,
        added_by: '',
      };
      qc.setQueryData<PageShape>(plannerKeys.groupMembers(groupId), (old) => {
        if (!old) return old;
        const [first, ...rest] = old.pages;
        return {
          ...old,
          pages: [
            {
              ...first,
              members: [...(first?.members ?? []), optimistic],
              total: (first?.total ?? 0) + 1,
            },
            ...rest,
          ],
        };
      });
    },
    onServerOk: () => {},
    savingId: (v) => `${groupId}:${v.user_id}`,
    invalidate: () => [plannerKeys.groupMembers(groupId)],
    errorMessage: () => "Couldn't add member.",
  });
}
