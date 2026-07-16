import { useToast } from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useRemoveGroupMembers(groupId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (userIds: string[]) =>
      plannerClient.removeGroupMembersBulk({ group_id: groupId, user_ids: userIds }),
    onSuccess: (_data, userIds) => {
      void qc.invalidateQueries({ queryKey: plannerKeys.groupMembers(groupId) });
      toast({
        body: userIds.length === 1 ? '1 member removed.' : `${userIds.length} members removed.`,
      });
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: plannerKeys.groupMembers(groupId) });
      toast({ body: "Couldn't remove members.", type: 'error' });
    },
  });
}
