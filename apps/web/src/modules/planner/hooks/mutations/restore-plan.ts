import type { PlanRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useRestorePlan() {
  return useOptimisticMutation<{ plan_id: string }, PlanRow>({
    mutationFn: (v) => plannerClient.restorePlan({ plan_id: v.plan_id }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: (v) => v.plan_id,
    invalidate: () => [plannerKeys.trash(), plannerKeys.all],
    errorMessage: () => "Couldn't restore plan.",
  });
}
