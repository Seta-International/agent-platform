import type { BucketRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useUpdateBucket(planId: string, bucketId: string) {
  return useOptimisticMutation<{ expected_version: number; patch: { name?: string } }, BucketRow>({
    mutationFn: (v) => plannerClient.updateBucket({ bucket_id: bucketId, ...v }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: () => bucketId,
    invalidate: () => [plannerKeys.plan(planId)],
    errorMessage: () => "Couldn't save bucket changes.",
  });
}
