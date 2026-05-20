import type { TaskRow, TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface CompleteVars {
  task_id: string;
  expected_version: number;
}

function mergeServer(server: TaskRow, cached: TaskWithAssigneesRow): TaskWithAssigneesRow {
  return {
    ...cached,
    ...server,
    assignees: cached.assignees,
    labels: cached.labels,
    checklist_summary: cached.checklist_summary,
  };
}

export function useCompleteTask(planId: string) {
  const listKey = plannerKeys.planTasks(planId, { plan_id: planId });

  return useOptimisticMutation<CompleteVars, TaskRow>({
    mutationFn: (v) => plannerClient.completeTask(v),
    snapshot: (v, qc) => [
      { key: listKey, prev: qc.getQueryData(listKey) },
      { key: plannerKeys.task(v.task_id), prev: qc.getQueryData(plannerKeys.task(v.task_id)) },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (prev) =>
        prev ? prev.map((t) => (t.id === v.task_id ? { ...t, progress: 'completed' } : t)) : prev,
      );
      qc.setQueryData<TaskWithAssigneesRow>(plannerKeys.task(v.task_id), (prev) =>
        prev ? { ...prev, progress: 'completed' } : prev,
      );
    },
    onServerOk: (server, v, qc) => {
      qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (prev) =>
        prev ? prev.map((t) => (t.id === server.id ? mergeServer(server, t) : t)) : prev,
      );
      qc.setQueryData<TaskWithAssigneesRow>(plannerKeys.task(v.task_id), (prev) =>
        prev ? mergeServer(server, prev) : prev,
      );
    },
    savingId: (v) => v.task_id,
    invalidate: (v) => [plannerKeys.taskEvents(v.task_id)],
    errorMessage: () => "Couldn't complete task.",
  });
}
