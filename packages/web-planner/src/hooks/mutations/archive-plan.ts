import type { PlanRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useArchivePlan(groupId: string, planId: string) {
  return useOptimisticMutation<void, PlanRow>({
    mutationFn: () => plannerClient.archivePlan({ plan_id: planId }),
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
    errorMessage: () => "Couldn't archive plan.",
  });
}
