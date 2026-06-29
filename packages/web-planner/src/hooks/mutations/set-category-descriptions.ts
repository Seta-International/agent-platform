import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface SetCategoryDescriptionsVars {
  slots: Record<number, { name?: string | null; label_id?: string | null }>;
}

export function useSetCategoryDescriptions(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: SetCategoryDescriptionsVars) =>
      plannerClient.setCategoryDescriptions({ plan_id: planId, slots: v.slots }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: plannerKeys.planCategories(planId) });
      qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
    },
  });
}
