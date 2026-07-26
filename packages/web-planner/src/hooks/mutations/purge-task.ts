import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function usePurgeTask() {
  return useOptimisticMutation<{ task_id: string }, void>({
    mutationFn: (v) => plannerClient.purgeTask({ task_id: v.task_id }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: (v) => v.task_id,
    invalidate: () => [plannerKeys.trash(), plannerKeys.all],
    errorMessage: () => "Couldn't permanently delete task.",
  });
}
