import type { GroupRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useDeleteGroup(groupId: string) {
  return useOptimisticMutation<{ expected_version: number }, void>({
    mutationFn: (v) => plannerClient.deleteGroup({ group_id: groupId, ...v }),
    snapshot: (_v, qc) => [
      { key: plannerKeys.myGroups(), prev: qc.getQueryData(plannerKeys.myGroups()) },
      { key: plannerKeys.group(groupId), prev: qc.getQueryData(plannerKeys.group(groupId)) },
    ],
    applyOptimistic: (_v, qc) => {
      qc.setQueryData<GroupRow[]>(plannerKeys.myGroups(), (gs) =>
        (gs ?? []).filter((g) => g.id !== groupId),
      );
    },
    onServerOk: () => {},
    savingId: () => groupId,
    invalidate: () => [plannerKeys.myGroups(), plannerKeys.trash()],
    errorMessage: () => "Couldn't delete group.",
  });
}
