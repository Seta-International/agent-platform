import type { TaskReferenceType } from '@seta/planner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface AddReferenceVars {
  task_id: string;
  url: string;
  alias?: string;
  type?: TaskReferenceType;
}

export function useAddTaskReference(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AddReferenceVars) => plannerClient.addTaskReference(v),
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: plannerKeys.task(v.task_id) });
      qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
    },
  });
}
