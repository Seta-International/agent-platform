import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function usePurgeGroup() {
  return useOptimisticMutation<{ group_id: string }, void>({
    mutationFn: (v) => plannerClient.purgeGroup({ group_id: v.group_id }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: (v) => v.group_id,
    invalidate: () => [plannerKeys.trash(), plannerKeys.all],
    errorMessage: () => "Couldn't permanently delete group.",
  });
}
