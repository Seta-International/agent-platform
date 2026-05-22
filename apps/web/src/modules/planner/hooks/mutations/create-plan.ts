import type { PlanRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useCreatePlan(groupId: string) {
  return useOptimisticMutation<{ name: string }, PlanRow>({
    mutationFn: (v) => plannerClient.createPlan({ group_id: groupId, name: v.name }),
    snapshot: (_v, qc) => [
      {
        key: plannerKeys.groupPlans(groupId),
        prev: qc.getQueryData(plannerKeys.groupPlans(groupId)),
      },
    ],
    applyOptimistic: (v, qc) => {
      const tempId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      qc.setQueryData<PlanRow[]>(plannerKeys.groupPlans(groupId), (prev) => [
        ...(prev ?? []),
        {
          id: tempId,
          tenant_id: '',
          group_id: groupId,
          name: v.name,
          category_descriptions: {},
          external_source: 'native',
          external_id: null,
          external_etag: null,
          external_synced_at: null,
          sync_status: 'idle',
          last_error: null,
          created_by: '',
          created_at: now,
          updated_at: now,
          deleted_at: null,
          version: 0,
        },
      ]);
    },
    onServerOk: (server, _v, qc) => {
      qc.setQueryData<PlanRow[]>(plannerKeys.groupPlans(groupId), (prev) =>
        (prev ?? []).map((p) => (p.id.startsWith('temp-') ? server : p)),
      );
    },
    savingId: () => undefined,
    invalidate: () => [plannerKeys.groupPlans(groupId)],
    errorMessage: () => "Couldn't create plan.",
  });
}
