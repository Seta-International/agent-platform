import type { PlanRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useDeletePlan(groupId: string, planId: string) {
  return useOptimisticMutation<{ expected_version: number }, void>({
    mutationFn: (v) => plannerClient.deletePlan({ plan_id: planId, ...v }),
    snapshot: (_v, qc) => [
      {
        key: plannerKeys.groupPlans(groupId),
        prev: qc.getQueryData(plannerKeys.groupPlans(groupId)),
      },
    ],
    applyOptimistic: (_v, qc) => {
      qc.setQueryData<PlanRow[]>(plannerKeys.groupPlans(groupId), (ps) =>
        (ps ?? []).filter((p) => p.id !== planId),
      );
    },
    onServerOk: () => {},
    savingId: () => planId,
    invalidate: () => [plannerKeys.groupPlans(groupId), plannerKeys.trash()],
    errorMessage: () => "Couldn't delete plan.",
  });
}
