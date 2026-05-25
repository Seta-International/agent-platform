import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { parseConflictVersion, patchBucketVersion } from '../../state/version-reconcile';
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
    onConflict: (err, vars, qc) => {
      const v = parseConflictVersion(err);
      if (v !== undefined) patchBucketVersion(qc, planId, vars.bucket_id, v);
    },
  });
}
