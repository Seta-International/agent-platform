import type { TaskRow, TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { parseConflictVersion, patchTaskVersion } from '../../state/version-reconcile';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface ReopenVars {
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

export function useReopenTask(planId: string) {
  const listKey = plannerKeys.planTasks(planId, { plan_id: planId });

  return useOptimisticMutation<ReopenVars, TaskRow>({
    mutationFn: (v) => plannerClient.reopenTask(v),
    snapshot: (v, qc) => [
      { key: listKey, prev: qc.getQueryData(listKey) },
      { key: plannerKeys.task(v.task_id), prev: qc.getQueryData(plannerKeys.task(v.task_id)) },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (prev) =>
        prev ? prev.map((t) => (t.id === v.task_id ? { ...t, progress: 'not_started' } : t)) : prev,
      );
      qc.setQueryData<TaskWithAssigneesRow>(plannerKeys.task(v.task_id), (prev) =>
        prev ? { ...prev, progress: 'not_started' } : prev,
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
    errorMessage: () => "Couldn't reopen task.",
    onConflict: (err, vars, qc) => {
      const v = parseConflictVersion(err);
      if (v !== undefined) patchTaskVersion(qc, planId, vars.task_id, v);
    },
  });
}
