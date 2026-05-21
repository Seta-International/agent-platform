import type { ChecklistItemRow, TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface UpdateChecklistVars {
  item_id: string;
  patch: { label?: string; checked?: boolean; order_hint?: string };
}

function recomputeChecked(items: ChecklistItemRow[]): { total: number; checked: number } {
  return { total: items.length, checked: items.filter((i) => i.checked).length };
}

function patchSummary(task: TaskWithAssigneesRow, items: ChecklistItemRow[]): TaskWithAssigneesRow {
  return { ...task, checklist_summary: recomputeChecked(items) };
}

export function useUpdateChecklistItem(planId: string, taskId: string) {
  const listKey = plannerKeys.planTasks(planId, { plan_id: planId });
  const checklistKey = plannerKeys.taskChecklist(taskId);
  const singleKey = plannerKeys.task(taskId);

  return useOptimisticMutation<UpdateChecklistVars, ChecklistItemRow>({
    mutationFn: (v) => plannerClient.updateChecklistItem(v),
    snapshot: (_v, qc) => [
      { key: checklistKey, prev: qc.getQueryData(checklistKey) },
      { key: listKey, prev: qc.getQueryData(listKey) },
      { key: singleKey, prev: qc.getQueryData(singleKey) },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<ChecklistItemRow[]>(checklistKey, (prev) => {
        if (!prev) return prev;
        const updated = prev.map((item) =>
          item.id === v.item_id ? { ...item, ...v.patch } : item,
        );
        if (v.patch.checked !== undefined) {
          qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (tasks) =>
            tasks ? tasks.map((t) => (t.id === taskId ? patchSummary(t, updated) : t)) : tasks,
          );
          qc.setQueryData<TaskWithAssigneesRow>(singleKey, (task) =>
            task ? patchSummary(task, updated) : task,
          );
        }
        return updated;
      });
    },
    onServerOk: (server, _v, qc) => {
      qc.setQueryData<ChecklistItemRow[]>(checklistKey, (prev) =>
        prev ? prev.map((item) => (item.id === server.id ? server : item)) : prev,
      );
    },
    savingId: () => undefined,
    invalidate: () => [plannerKeys.taskEvents(taskId)],
    errorMessage: () => "Couldn't update checklist item.",
  });
}
