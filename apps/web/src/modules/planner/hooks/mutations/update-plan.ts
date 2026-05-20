import type { PlanRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export function useUpdatePlan(groupId: string, planId: string) {
  return useOptimisticMutation<{ expected_version: number; patch: { name?: string } }, PlanRow>({
    mutationFn: (v) => plannerClient.updatePlan({ plan_id: planId, ...v }),
    snapshot: (_v, qc) => [
      { key: plannerKeys.plan(planId), prev: qc.getQueryData(plannerKeys.plan(planId)) },
      {
        key: plannerKeys.groupPlans(groupId),
        prev: qc.getQueryData(plannerKeys.groupPlans(groupId)),
      },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<PlanRow>(plannerKeys.plan(planId), (p) => (p ? { ...p, ...v.patch } : p));
      qc.setQueryData<PlanRow[]>(plannerKeys.groupPlans(groupId), (ps) =>
        (ps ?? []).map((p) => (p.id === planId ? { ...p, ...v.patch } : p)),
      );
    },
    onServerOk: (server, _v, qc) => {
      qc.setQueryData(plannerKeys.plan(planId), server);
      qc.setQueryData<PlanRow[]>(plannerKeys.groupPlans(groupId), (ps) =>
        (ps ?? []).map((p) => (p.id === planId ? server : p)),
      );
    },
    savingId: () => planId,
    invalidate: () => [plannerKeys.plan(planId), plannerKeys.groupPlans(groupId)],
    errorMessage: () => "Couldn't save plan changes.",
  });
}
