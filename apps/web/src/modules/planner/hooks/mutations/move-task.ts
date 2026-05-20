import type { TaskRow, TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface MoveVars {
  task_id: string;
  expected_version: number;
  to_bucket_id: string | null;
  after_task_id?: string;
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
        const others = prev.filter((t) => t.id !== v.task_id);
        const inTarget = others
          .filter((t) => t.bucket_id === v.to_bucket_id)
          .sort((a, b) => a.sort_order - b.sort_order);
        const insertAfterIdx = v.after_task_id
          ? inTarget.findIndex((t) => t.id === v.after_task_id)
          : -1;
        const afterOrder = insertAfterIdx >= 0 ? inTarget[insertAfterIdx]?.sort_order : undefined;
        const nextOrder =
          insertAfterIdx >= 0 ? inTarget[insertAfterIdx + 1]?.sort_order : inTarget[0]?.sort_order;
        const newOrder =
          afterOrder !== undefined && nextOrder !== undefined
            ? (afterOrder + nextOrder) / 2
            : afterOrder !== undefined
              ? afterOrder + 1_000_000
              : nextOrder !== undefined
                ? nextOrder - 1_000_000
                : 1_000_000;
        const updated: TaskWithAssigneesRow = {
          ...moved,
          bucket_id: v.to_bucket_id,
          sort_order: newOrder,
        };
        const outOfTarget = others.filter((t) => t.bucket_id !== v.to_bucket_id);
        const head = inTarget.slice(0, insertAfterIdx + 1);
        const tail = inTarget.slice(insertAfterIdx + 1);
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
