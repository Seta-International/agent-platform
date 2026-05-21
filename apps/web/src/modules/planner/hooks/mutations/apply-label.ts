import type { LabelRow, TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface ApplyLabelVars {
  task_id: string;
  label_id: string;
  label_name?: string;
  label_color?: string;
}

function addLabel(task: TaskWithAssigneesRow, v: ApplyLabelVars): TaskWithAssigneesRow {
  if (task.labels.some((l) => l.id === v.label_id)) return task;
  const optimistic: LabelRow = {
    id: v.label_id,
    // Why: caller may not pass these; server data corrects on invalidate refetch.
    tenant_id: '',
    plan_id: '',
    name: v.label_name ?? '',
    color: v.label_color ?? '',
    category_slot: null,
    created_at: new Date().toISOString(),
    deleted_at: null,
  };
  return { ...task, labels: [...task.labels, optimistic] };
}

export function useApplyLabel(planId: string) {
  const listKey = plannerKeys.planTasks(planId, { plan_id: planId });

  return useOptimisticMutation<ApplyLabelVars, void>({
    mutationFn: (v) => plannerClient.applyLabel({ task_id: v.task_id, label_id: v.label_id }),
    snapshot: (v, qc) => [
      { key: listKey, prev: qc.getQueryData(listKey) },
      { key: plannerKeys.task(v.task_id), prev: qc.getQueryData(plannerKeys.task(v.task_id)) },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (prev) =>
        prev ? prev.map((t) => (t.id === v.task_id ? addLabel(t, v) : t)) : prev,
      );
      qc.setQueryData<TaskWithAssigneesRow>(plannerKeys.task(v.task_id), (prev) =>
        prev ? addLabel(prev, v) : prev,
      );
    },
    onServerOk: () => {},
    savingId: (v) => v.task_id,
    invalidate: (v) => [plannerKeys.task(v.task_id), plannerKeys.taskEvents(v.task_id)],
    errorMessage: () => "Couldn't apply label.",
  });
}
