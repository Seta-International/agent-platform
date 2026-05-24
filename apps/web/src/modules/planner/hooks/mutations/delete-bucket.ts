import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useDeleteBucket(planId: string) {
  return useOptimisticMutation<{ bucket_id: string; expected_version: number }, void>({
    mutationFn: (v) => plannerClient.deleteBucket(v),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: (v) => v.bucket_id,
    invalidate: () => [plannerKeys.plan(planId)],
    errorMessage: () => "Couldn't delete bucket.",
  });
}
