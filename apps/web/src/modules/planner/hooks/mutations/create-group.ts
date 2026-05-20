import type { GroupRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useCreateGroup() {
  return useOptimisticMutation<{ name: string }, GroupRow>({
    mutationFn: (v) => plannerClient.createGroup(v),
    snapshot: (_v, qc) => [
      { key: plannerKeys.myGroups(), prev: qc.getQueryData(plannerKeys.myGroups()) },
    ],
    applyOptimistic: (v, qc) => {
      const tempId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const optimistic: GroupRow = {
        id: tempId,
        tenant_id: '',
        name: v.name,
        account_id: null,
        created_by: '',
        created_at: now,
        updated_at: now,
        deleted_at: null,
        version: 0,
      };
      qc.setQueryData<GroupRow[]>(plannerKeys.myGroups(), (prev) => [...(prev ?? []), optimistic]);
    },
    onServerOk: (server, _v, qc) => {
      qc.setQueryData<GroupRow[]>(plannerKeys.myGroups(), (prev) =>
        (prev ?? []).map((g) => (g.id.startsWith('temp-') ? server : g)),
      );
    },
    savingId: () => undefined,
    invalidate: () => [plannerKeys.myGroups(), plannerKeys.groups()],
    errorMessage: (err) =>
      `Couldn't create group${err instanceof Error ? `: ${err.message}` : ''}.`,
  });
}
