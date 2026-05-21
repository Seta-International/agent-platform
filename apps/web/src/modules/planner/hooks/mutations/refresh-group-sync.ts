import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useRefreshGroupSync(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plannerClient.refreshGroupSync({ groupId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: plannerKeys.groupsWithCounts() });
      void qc.invalidateQueries({ queryKey: plannerKeys.groupSyncStatus(groupId) });
    },
  });
}
