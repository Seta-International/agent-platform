import type { GroupRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useRestoreGroup() {
  return useOptimisticMutation<{ group_id: string }, GroupRow>({
    mutationFn: (v) => plannerClient.restoreGroup({ group_id: v.group_id }),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: (v) => v.group_id,
    invalidate: () => [plannerKeys.trash(), plannerKeys.myGroups(), plannerKeys.groups()],
    errorMessage: () => "Couldn't restore group.",
  });
}
