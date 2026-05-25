import type { ChecklistItemRow, TaskDetailRow, TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface RemoveChecklistVars {
  item_id: string;
}

function recomputeSummary(items: ChecklistItemRow[]): { total: number; checked: number } {
  return { total: items.length, checked: items.filter((i) => i.checked).length };
}

export function useRemoveChecklistItem(planId: string, taskId: string) {
  const listKey = plannerKeys.planTasks(planId, { plan_id: planId });
  const checklistKey = plannerKeys.taskChecklist(taskId);
  const singleKey = plannerKeys.task(taskId);

  return useOptimisticMutation<RemoveChecklistVars, void>({
    mutationFn: (v) => plannerClient.removeChecklistItem(v),
    snapshot: (_v, qc) => [
      { key: checklistKey, prev: qc.getQueryData(checklistKey) },
      { key: listKey, prev: qc.getQueryData(listKey) },
      { key: singleKey, prev: qc.getQueryData(singleKey) },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<ChecklistItemRow[]>(checklistKey, (prev) =>
        prev ? prev.filter((item) => item.id !== v.item_id) : prev,
      );
      qc.setQueryData<TaskDetailRow>(singleKey, (task) => {
        if (!task) return task;
        const nextChecklist = task.checklist.filter((item) => item.id !== v.item_id);
        return {
          ...task,
          checklist: nextChecklist,
          checklist_summary: recomputeSummary(nextChecklist),
        };
      });
      qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (tasks) => {
        if (!tasks) return tasks;
        const detail = qc.getQueryData<TaskDetailRow>(singleKey);
        if (!detail) return tasks;
        return tasks.map((t) =>
          t.id === taskId ? { ...t, checklist_summary: detail.checklist_summary } : t,
        );
      });
    },
    onServerOk: () => {},
    savingId: () => undefined,
    invalidate: () => [plannerKeys.taskEvents(taskId)],
    errorMessage: () => "Couldn't remove checklist item.",
  });
}
