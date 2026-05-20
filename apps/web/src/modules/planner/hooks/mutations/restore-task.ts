import type { TaskRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useRestoreTask() {
  return useOptimisticMutation<{ task_id: string }, TaskRow>({
    mutationFn: (v) => plannerClient.restoreTask({ task_id: v.task_id }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: (v) => v.task_id,
    invalidate: () => [plannerKeys.trash(), plannerKeys.all],
    errorMessage: () => "Couldn't restore task.",
  });
}
