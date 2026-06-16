import type { TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface UnassignVars {
  task_id: string;
  user_id: string;
}

function removeAssignee(task: TaskWithAssigneesRow, userId: string): TaskWithAssigneesRow {
  return { ...task, assignees: task.assignees.filter((a) => a.user_id !== userId) };
}

export function useUnassignTask(planId: string) {
  const listKey = plannerKeys.planTasks(planId, { plan_id: planId });

  return useOptimisticMutation<UnassignVars, void>({
    mutationFn: (v) => plannerClient.unassignTask(v),
    snapshot: (v, qc) => [
      { key: listKey, prev: qc.getQueryData(listKey) },
      { key: plannerKeys.task(v.task_id), prev: qc.getQueryData(plannerKeys.task(v.task_id)) },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (prev) =>
        prev ? prev.map((t) => (t.id === v.task_id ? removeAssignee(t, v.user_id) : t)) : prev,
      );
      qc.setQueryData<TaskWithAssigneesRow>(plannerKeys.task(v.task_id), (prev) =>
        prev ? removeAssignee(prev, v.user_id) : prev,
      );
    },
    onServerOk: () => {},
    savingId: (v) => v.task_id,
    invalidate: (v) => [plannerKeys.task(v.task_id), plannerKeys.taskEvents(v.task_id), listKey],
    errorMessage: () => "Couldn't unassign.",
  });
}
