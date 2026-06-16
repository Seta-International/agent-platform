import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useRefreshPlanSync(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plannerClient.refreshPlanSync({ planId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: plannerKeys.planSyncStatus(planId) });
      void qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
    },
  });
}
