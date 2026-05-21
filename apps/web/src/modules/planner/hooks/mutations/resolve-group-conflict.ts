import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useResolveGroupConflict(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (decisions: Array<{ field: string; choice: 'local' | 'remote' }>) =>
      plannerClient.resolveGroupConflict({ groupId, decisions }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: plannerKeys.groupsWithCounts() });
      void qc.invalidateQueries({ queryKey: plannerKeys.groupSyncStatus(groupId) });
    },
  });
}
