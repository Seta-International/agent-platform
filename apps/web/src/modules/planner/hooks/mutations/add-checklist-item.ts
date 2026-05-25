import type { ChecklistItemRow, TaskDetailRow, TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface AddChecklistVars {
  label: string;
  after_item_id?: string;
}

function bumpSummary(task: TaskWithAssigneesRow): TaskWithAssigneesRow {
  return {
    ...task,
    checklist_summary: { ...task.checklist_summary, total: task.checklist_summary.total + 1 },
  };
}

export function useAddChecklistItem(planId: string, taskId: string) {
  const listKey = plannerKeys.planTasks(planId, { plan_id: planId });
  const checklistKey = plannerKeys.taskChecklist(taskId);
  const singleKey = plannerKeys.task(taskId);

  return useOptimisticMutation<AddChecklistVars, ChecklistItemRow>({
    mutationFn: (v) =>
      plannerClient.addChecklistItem({
        task_id: taskId,
        label: v.label,
        after_item_id: v.after_item_id,
      }),
    snapshot: (_v, qc) => [
      { key: checklistKey, prev: qc.getQueryData(checklistKey) },
      { key: listKey, prev: qc.getQueryData(listKey) },
      { key: singleKey, prev: qc.getQueryData(singleKey) },
    ],
    applyOptimistic: (v, qc) => {
      const tempId = `temp-${Math.random().toString(36).slice(2)}`;
      const now = new Date().toISOString();
      const tempItem: ChecklistItemRow = {
        id: tempId,
        task_id: taskId,
        label: v.label,
        checked: false,
        order_hint: null,
        external_id: null,
        external_etag: null,
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ChecklistItemRow[]>(checklistKey, (prev) => [...(prev ?? []), tempItem]);
      qc.setQueryData<TaskWithAssigneesRow[]>(listKey, (prev) =>
        prev ? prev.map((t) => (t.id === taskId ? bumpSummary(t) : t)) : prev,
      );
      // TaskDetailChecklistCard reads task.checklist from the TaskDetailRow under
      // singleKey — appending here is what makes the new item appear live.
      qc.setQueryData<TaskDetailRow>(singleKey, (prev) =>
        prev
          ? {
              ...prev,
              checklist: [...prev.checklist, tempItem],
              checklist_summary: {
                ...prev.checklist_summary,
                total: prev.checklist_summary.total + 1,
              },
            }
          : prev,
      );
    },
    onServerOk: (server, _v, qc) => {
      qc.setQueryData<ChecklistItemRow[]>(checklistKey, (prev) => {
        if (!prev) return prev;
        const tempIdx = prev.findIndex((item) => item.id.startsWith('temp-'));
        if (tempIdx === -1) return [...prev, server];
        return prev.map((item, i) => (i === tempIdx ? server : item));
      });
      qc.setQueryData<TaskDetailRow>(singleKey, (prev) => {
        if (!prev) return prev;
        const tempIdx = prev.checklist.findIndex((item) => item.id.startsWith('temp-'));
        const nextChecklist =
          tempIdx === -1
            ? [...prev.checklist, server]
            : prev.checklist.map((item, i) => (i === tempIdx ? server : item));
        return { ...prev, checklist: nextChecklist };
      });
    },
    savingId: () => undefined,
    invalidate: () => [plannerKeys.taskEvents(taskId)],
    errorMessage: () => "Couldn't add checklist item.",
  });
}
