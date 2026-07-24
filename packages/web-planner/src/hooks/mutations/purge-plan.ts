import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function usePurgePlan() {
  return useOptimisticMutation<{ plan_id: string }, void>({
    mutationFn: (v) => plannerClient.purgePlan({ plan_id: v.plan_id }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: (v) => v.plan_id,
    invalidate: () => [plannerKeys.trash(), plannerKeys.all],
    errorMessage: () => "Couldn't permanently delete plan.",
  });
}
