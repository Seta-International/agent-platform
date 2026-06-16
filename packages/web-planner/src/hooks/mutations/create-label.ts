import type { LabelRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useCreateLabel(planId: string) {
  return useOptimisticMutation<{ name: string; color: string }, LabelRow>({
    mutationFn: (v) => plannerClient.createLabel({ plan_id: planId, name: v.name, color: v.color }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: () => undefined,
    invalidate: () => [plannerKeys.planLabels(planId)],
    errorMessage: () => "Couldn't create label.",
  });
}
