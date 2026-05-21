import type { TaskRow, TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface MoveVars {
  task_id: string;
  expected_version: number;
  bucket_id?: string | null;
  before_id?: string;
  after_id?: string;
}

export function useMoveTask(planId: string) {
  const key = plannerKeys.planTasks(planId, { plan_id: planId });
  return useOptimisticMutation<MoveVars, TaskRow>({
    mutationFn: (v) => plannerClient.moveTask(v),
    snapshot: (_v, qc) => [{ key, prev: qc.getQueryData(key) }],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<TaskWithAssigneesRow[]>(key, (prev) => {
        if (!prev) return prev;
        const moved = prev.find((t) => t.id === v.task_id);
        if (!moved) return prev;
        const targetBucket = v.bucket_id !== undefined ? v.bucket_id : moved.bucket_id;
        const others = prev.filter((t) => t.id !== v.task_id);
        const inTarget = others
          .filter((t) => t.bucket_id === targetBucket)
          .sort((a, b) => compareHint(a.order_hint, b.order_hint));
        let insertIdx = inTarget.length;
        if (v.before_id !== undefined) {
          const idx = inTarget.findIndex((t) => t.id === v.before_id);
          if (idx >= 0) insertIdx = idx;
        } else if (v.after_id !== undefined) {
          const idx = inTarget.findIndex((t) => t.id === v.after_id);
          if (idx >= 0) insertIdx = idx + 1;
        }
        // Optimistic order_hint: borrow neighbour's hint so optimistic sort is stable.
        // Server response will replace with the canonical fractional hint.
        const neighbour = inTarget[insertIdx - 1]?.order_hint ?? inTarget[insertIdx]?.order_hint;
        const updated: TaskWithAssigneesRow = {
          ...moved,
          bucket_id: targetBucket,
          order_hint: neighbour ?? moved.order_hint,
        };
        const outOfTarget = others.filter((t) => t.bucket_id !== targetBucket);
        const head = inTarget.slice(0, insertIdx);
        const tail = inTarget.slice(insertIdx);
        return [...outOfTarget, ...head, updated, ...tail];
      });
    },
    onServerOk: (server, _v, qc) => {
      qc.setQueryData<TaskWithAssigneesRow[]>(key, (prev) =>
        prev
          ? prev.map((t) =>
              t.id === server.id
                ? {
                    ...t,
                    ...server,
                    assignees: t.assignees,
                    labels: t.labels,
                    checklist_summary: t.checklist_summary,
                  }
                : t,
            )
          : prev,
      );
    },
    savingId: (v) => v.task_id,
    invalidate: () => [],
    errorMessage: (err) =>
      (err as { status?: number }).status === 409
        ? 'Someone else moved this — refreshed.'
        : "Couldn't move task.",
  });
}

function compareHint(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
