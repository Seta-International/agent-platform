import type { ChecklistItemRow, TaskDetailRow, TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface UpdateChecklistVars {
  item_id: string;
  patch: { label?: string; checked?: boolean; order_hint?: string };
}

function recomputeSummary(items: ChecklistItemRow[]): { total: number; checked: number } {
  return { total: items.length, checked: items.filter((i) => i.checked).length };
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
      qc.setQueryData<ChecklistItemRow[]>(checklistKey, (prev) =>
        prev ? prev.map((item) => (item.id === v.item_id ? { ...item, ...v.patch } : item)) : prev,
      );
      qc.setQueryData<TaskDetailRow>(singleKey, (task) => {
        if (!task) return task;
        const nextChecklist = task.checklist.map((item) =>
          item.id === v.item_id ? { ...item, ...v.patch } : item,
        );
        const summary =
          v.patch.checked !== undefined ? recomputeSummary(nextChecklist) : task.checklist_summary;
        return { ...task, checklist: nextChecklist, checklist_summary: summary };
      });
      if (v.patch.checked !== undefined) {
        qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (tasks) => {
          if (!tasks) return tasks;
          const detail = qc.getQueryData<TaskDetailRow>(singleKey);
          if (!detail) return tasks;
          return tasks.map((t) =>
            t.id === taskId ? { ...t, checklist_summary: detail.checklist_summary } : t,
          );
        });
      }
    },
    onServerOk: (server, _v, qc) => {
      qc.setQueryData<ChecklistItemRow[]>(checklistKey, (prev) =>
        prev ? prev.map((item) => (item.id === server.id ? server : item)) : prev,
      );
      qc.setQueryData<TaskDetailRow>(singleKey, (task) =>
        task
          ? {
              ...task,
              checklist: task.checklist.map((item) => (item.id === server.id ? server : item)),
            }
          : task,
      );
    },
    savingId: () => undefined,
    invalidate: () => [plannerKeys.taskEvents(taskId)],
    errorMessage: () => "Couldn't update checklist item.",
  });
}
