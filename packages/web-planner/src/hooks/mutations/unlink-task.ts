import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface UnlinkVars {
  /** The `task_references` row id — a link is a row of that table (design §3.1),
   *  and an INCOMING link's row belongs to the other task, so the id is the only
   *  thing that can address it. */
  reference_id: string;
  /** The task whose detail is on screen — what to refetch. The other endpoint's
   *  detail is not invalidated: it is not mounted, and its own query refetches
   *  when it next opens. */
  task_id: string;
}

export function useUnlinkTask(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: UnlinkVars) => plannerClient.unlinkTask({ reference_id: v.reference_id }),
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: plannerKeys.task(v.task_id) });
      qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
    },
  });
}
