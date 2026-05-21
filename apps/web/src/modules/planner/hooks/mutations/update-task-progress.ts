import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface UpdateProgressVars {
  task_id: string;
  expected_version: number;
  percent_complete?: number;
  is_deferred?: boolean;
}

export function useUpdateTaskProgress(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: UpdateProgressVars) => {
      const patch: { percent_complete?: number; is_deferred?: boolean } = {};
      if (v.percent_complete !== undefined) patch.percent_complete = v.percent_complete;
      if (v.is_deferred !== undefined) patch.is_deferred = v.is_deferred;
      return plannerClient.updateTask({
        task_id: v.task_id,
        expected_version: v.expected_version,
        patch,
      });
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: plannerKeys.task(v.task_id) });
      qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
    },
  });
}
