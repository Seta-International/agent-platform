import type { BucketRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useCreateBucket(planId: string) {
  return useOptimisticMutation<{ name: string; after_bucket_id?: string }, BucketRow>({
    mutationFn: (v) => plannerClient.createBucket({ plan_id: planId, ...v }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: () => undefined,
    invalidate: () => [plannerKeys.plan(planId)],
    errorMessage: () => "Couldn't create bucket.",
  });
}
