import type { BucketRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface ReorderVars {
  bucket_id: string;
  expected_version: number;
  after_bucket_id?: string;
}

export function useReorderBucket(planId: string) {
  const key = [...plannerKeys.plan(planId), 'buckets'] as const;
  return useOptimisticMutation<ReorderVars, BucketRow>({
    mutationFn: (v) => plannerClient.reorderBucket(v),
    snapshot: (_v, qc) => [{ key, prev: qc.getQueryData(key) }],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<BucketRow[]>(key, (prev) => {
        if (!prev) return prev;
        const moved = prev.find((b) => b.id === v.bucket_id);
        if (!moved) return prev;
        const others = prev.filter((b) => b.id !== v.bucket_id);
        if (v.after_bucket_id === undefined) return [moved, ...others];
        const afterIdx = others.findIndex((b) => b.id === v.after_bucket_id);
        if (afterIdx === -1) return prev;
        return [...others.slice(0, afterIdx + 1), moved, ...others.slice(afterIdx + 1)];
      });
    },
    onServerOk: (server, _v, qc) => {
      qc.setQueryData<BucketRow[]>(key, (prev) =>
        prev ? prev.map((b) => (b.id === server.id ? server : b)) : prev,
      );
    },
    savingId: (v) => v.bucket_id,
    invalidate: () => [],
    errorMessage: (err) =>
      (err as { status?: number }).status === 409
        ? 'Someone else reordered — refreshed.'
        : "Couldn't reorder bucket.",
  });
}
