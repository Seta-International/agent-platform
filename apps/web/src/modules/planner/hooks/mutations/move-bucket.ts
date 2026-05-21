import type { BucketRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface MoveVars {
  plan_id: string;
  bucket_id: string;
  before_id?: string;
  after_id?: string;
}

export function useMoveBucket(planId: string) {
  const key = [...plannerKeys.plan(planId), 'buckets'] as const;
  return useOptimisticMutation<MoveVars, BucketRow>({
    mutationFn: (v) => plannerClient.moveBucket(v),
    snapshot: (_v, qc) => [{ key, prev: qc.getQueryData(key) }],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<BucketRow[]>(key, (prev) => {
        if (!prev) return prev;
        const moved = prev.find((b) => b.id === v.bucket_id);
        if (!moved) return prev;
        const others = prev.filter((b) => b.id !== v.bucket_id);
        if (v.before_id !== undefined) {
          const idx = others.findIndex((b) => b.id === v.before_id);
          if (idx === -1) return prev;
          return [...others.slice(0, idx), moved, ...others.slice(idx)];
        }
        if (v.after_id !== undefined) {
          const idx = others.findIndex((b) => b.id === v.after_id);
          if (idx === -1) return prev;
          return [...others.slice(0, idx + 1), moved, ...others.slice(idx + 1)];
        }
        return [...others, moved];
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
