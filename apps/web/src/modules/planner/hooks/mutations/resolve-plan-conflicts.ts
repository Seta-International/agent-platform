import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export type ResolvePlanDecisions = Parameters<
  typeof plannerClient.resolvePlanConflicts
>[0]['decisions'];

export function useResolvePlanConflicts(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (decisions: ResolvePlanDecisions) =>
      plannerClient.resolvePlanConflicts({ planId, decisions }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: plannerKeys.planConflicts(planId) });
      void qc.invalidateQueries({ queryKey: plannerKeys.planSyncStatus(planId) });
      void qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
    },
  });
}
