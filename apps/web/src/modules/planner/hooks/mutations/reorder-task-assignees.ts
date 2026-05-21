import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateNKeysBetween } from 'fractional-indexing';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface ReorderVars {
  task_id: string;
  newOrder: Array<{ user_id: string }>;
}

export function useReorderTaskAssignees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ReorderVars) => {
      const hints = generateNKeysBetween(null, null, v.newOrder.length);
      const assignees = v.newOrder.map((a, i) => ({
        user_id: a.user_id,
        order_hint: hints[i]!,
      }));
      return plannerClient.setTaskAssignees({ task_id: v.task_id, assignees });
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: plannerKeys.task(v.task_id) });
    },
  });
}
