import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useDeleteArchivedPlan() {
  return useOptimisticMutation<{ plan_id: string; expected_version: number }, void>({
    mutationFn: (v) =>
      plannerClient.deletePlan({ plan_id: v.plan_id, expected_version: v.expected_version }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: (v) => v.plan_id,
    invalidate: () => [plannerKeys.trash()],
    errorMessage: () => "Couldn't delete archived plan.",
  });
}
