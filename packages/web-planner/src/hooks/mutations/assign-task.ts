import type { AssigneeRow, TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface AssignVars {
  task_id: string;
  user_id: string;
  display_name?: string;
  email?: string;
}

function addAssignee(task: TaskWithAssigneesRow, v: AssignVars): TaskWithAssigneesRow {
  if (task.assignees.some((a) => a.user_id === v.user_id)) return task;
  const optimistic: AssigneeRow = {
    user_id: v.user_id,
    display_name: v.display_name ?? '…',
    email: v.email ?? '',
    // Why: caller may not know live status; server data corrects on next fetch.
    availability_status: 'available',
    ooo_until: null,
    deactivated_at: null,
  };
  return { ...task, assignees: [...task.assignees, optimistic] };
}

export function useAssignTask(planId: string) {
  const listKey = plannerKeys.planTasks(planId, { plan_id: planId });

  return useOptimisticMutation<AssignVars, void>({
    mutationFn: (v) => plannerClient.assignTask({ task_id: v.task_id, user_id: v.user_id }),
    snapshot: (v, qc) => [
      { key: listKey, prev: qc.getQueryData(listKey) },
      { key: plannerKeys.task(v.task_id), prev: qc.getQueryData(plannerKeys.task(v.task_id)) },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (prev) =>
        prev ? prev.map((t) => (t.id === v.task_id ? addAssignee(t, v) : t)) : prev,
      );
      qc.setQueryData<TaskWithAssigneesRow>(plannerKeys.task(v.task_id), (prev) =>
        prev ? addAssignee(prev, v) : prev,
      );
    },
    onServerOk: () => {},
    savingId: (v) => v.task_id,
    invalidate: (v) => [plannerKeys.task(v.task_id), plannerKeys.taskEvents(v.task_id), listKey],
    errorMessage: () => "Couldn't assign.",
  });
}
