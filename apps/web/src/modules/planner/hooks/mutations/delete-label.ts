import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface DeleteLabelVars {
  label_id: string;
  // Optional: the currently-open task, so its detail query refetches after the
  // server cascade removes the label from task_labels.
  task_id?: string;
}

export function useDeleteLabel(planId: string) {
  return useOptimisticMutation<DeleteLabelVars, void>({
    mutationFn: (v) => plannerClient.deleteLabel({ label_id: v.label_id }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: () => undefined,
    invalidate: (v) => {
      const keys: (readonly unknown[])[] = [
        plannerKeys.planLabels(planId),
        plannerKeys.planTasks(planId, { plan_id: planId }),
        plannerKeys.planCategories(planId),
      ];
      if (v.task_id) keys.push(plannerKeys.task(v.task_id));
      return keys;
    },
    errorMessage: () => "Couldn't delete label.",
  });
}
