import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useLinkGroupToM365(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (externalId: string) => plannerClient.linkGroupToM365({ groupId, externalId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: plannerKeys.groupsWithCounts() });
      void qc.invalidateQueries({ queryKey: plannerKeys.groupSyncStatus(groupId) });
    },
  });
}
