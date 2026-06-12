import type { LabelRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface UpdateLabelVars {
  label_id: string;
  patch: { name?: string; color?: string };
}

// Rename/recolor changes how the label renders on every task and in the
// categories editor, so invalidate tasks + categories alongside the label list.
export function useUpdateLabel(planId: string) {
  return useOptimisticMutation<UpdateLabelVars, LabelRow>({
    mutationFn: (v) => plannerClient.updateLabel({ label_id: v.label_id, patch: v.patch }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: () => undefined,
    invalidate: () => [
      plannerKeys.planLabels(planId),
      plannerKeys.planTasks(planId, { plan_id: planId }),
      plannerKeys.planCategories(planId),
    ],
    errorMessage: () => "Couldn't update label.",
  });
}
