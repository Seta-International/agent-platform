import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface RemoveReferenceVars {
  task_id: string;
  url: string;
}

export function useRemoveTaskReference(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: RemoveReferenceVars) => plannerClient.removeTaskReference(v),
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: plannerKeys.task(v.task_id) });
      qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
    },
  });
}
