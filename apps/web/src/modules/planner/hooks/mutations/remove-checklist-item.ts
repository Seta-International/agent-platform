import type { ChecklistItemRow, TaskWithAssigneesRow } from '@seta/planner';
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
      qc.setQueryData<ChecklistItemRow[]>(checklistKey, (prev) => {
        if (!prev) return prev;
        const updated = prev.filter((item) => item.id !== v.item_id);
        const summary = recomputeSummary(updated);
        qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (tasks) =>
          tasks
            ? tasks.map((t) => (t.id === taskId ? { ...t, checklist_summary: summary } : t))
            : tasks,
        );
        qc.setQueryData<TaskWithAssigneesRow>(singleKey, (task) =>
          task ? { ...task, checklist_summary: summary } : task,
        );
        return updated;
      });
    },
    onServerOk: () => {},
    savingId: () => undefined,
    invalidate: () => [plannerKeys.taskEvents(taskId)],
    errorMessage: () => "Couldn't remove checklist item.",
  });
}
