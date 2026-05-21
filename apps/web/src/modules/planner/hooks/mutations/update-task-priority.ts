import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface UpdatePriorityVars {
  task_id: string;
  expected_version: number;
  priority_number: 1 | 3 | 5 | 9;
}

export function useUpdateTaskPriority(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: UpdatePriorityVars) =>
      plannerClient.updateTask({
        task_id: v.task_id,
        expected_version: v.expected_version,
        patch: { priority_number: v.priority_number },
      }),
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: plannerKeys.task(v.task_id) });
      qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
    },
  });
}
