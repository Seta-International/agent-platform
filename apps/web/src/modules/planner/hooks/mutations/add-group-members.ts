import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useAddGroupMembers(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (members: { user_id: string }[]) =>
      plannerClient.addGroupMembersBulk({ group_id: groupId, members }),
    onSuccess: (result) => {
      if (result.status === 201) {
        void qc.invalidateQueries({ queryKey: plannerKeys.groupMembers(groupId) });
      }
      // 202: caller schedules its own refetch after the toast
    },
  });
}
