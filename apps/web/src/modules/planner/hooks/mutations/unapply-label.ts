import type { TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface UnapplyLabelVars {
  task_id: string;
  label_id: string;
}

function removeLabel(task: TaskWithAssigneesRow, labelId: string): TaskWithAssigneesRow {
  return { ...task, labels: task.labels.filter((l) => l.id !== labelId) };
}

export function useUnapplyLabel(planId: string) {
  const listKey = plannerKeys.planTasks(planId, { plan_id: planId });

  return useOptimisticMutation<UnapplyLabelVars, void>({
    mutationFn: (v) => plannerClient.unapplyLabel(v),
    snapshot: (v, qc) => [
      { key: listKey, prev: qc.getQueryData(listKey) },
      { key: plannerKeys.task(v.task_id), prev: qc.getQueryData(plannerKeys.task(v.task_id)) },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (prev) =>
        prev ? prev.map((t) => (t.id === v.task_id ? removeLabel(t, v.label_id) : t)) : prev,
      );
      qc.setQueryData<TaskWithAssigneesRow>(plannerKeys.task(v.task_id), (prev) =>
        prev ? removeLabel(prev, v.label_id) : prev,
      );
    },
    onServerOk: () => {},
    savingId: (v) => v.task_id,
    invalidate: (v) => [plannerKeys.task(v.task_id), plannerKeys.taskEvents(v.task_id)],
    errorMessage: () => "Couldn't remove label.",
  });
}
