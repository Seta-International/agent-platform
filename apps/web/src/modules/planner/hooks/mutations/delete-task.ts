import type { TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface DeleteVars {
  task_id: string;
  expected_version: number;
}

export function useDeleteTask(planId: string) {
  const listKey = plannerKeys.planTasks(planId, { plan_id: planId });

  return useOptimisticMutation<DeleteVars, void>({
    mutationFn: (v) => plannerClient.deleteTask(v),
    snapshot: (_v, qc) => [{ key: listKey, prev: qc.getQueryData(listKey) }],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (prev) =>
        prev ? prev.filter((t) => t.id !== v.task_id) : prev,
      );
    },
    onServerOk: () => {},
    savingId: (v) => v.task_id,
    invalidate: () => [plannerKeys.trash()],
    errorMessage: (err) =>
      (err as { status?: number }).status === 409
        ? 'Someone else changed this task.'
        : "Couldn't delete task.",
  });
}
