import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useDeleteBucket(planId: string, bucketId: string) {
  return useOptimisticMutation<{ expected_version: number }, void>({
    mutationFn: (v) => plannerClient.deleteBucket({ bucket_id: bucketId, ...v }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: () => bucketId,
    invalidate: () => [plannerKeys.plan(planId)],
    errorMessage: () => "Couldn't delete bucket.",
  });
}
