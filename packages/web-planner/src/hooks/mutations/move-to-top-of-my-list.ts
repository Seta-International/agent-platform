import type { TaskWithAssigneesRow } from '@seta/planner';
import { toast } from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateKeyBetween } from 'fractional-indexing';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface MoveToTopVars {
  task_id: string;
}

function lowestHint(tasks: readonly TaskWithAssigneesRow[]): string | null {
  let lowest: string | null = null;
  for (const t of tasks) {
    const hint = t.assignee_priority;
    if (!hint) continue;
    if (lowest === null || hint < lowest) lowest = hint;
  }
  return lowest;
}

export function useMoveToTopOfMyList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: MoveToTopVars) => {
      const cached = qc.getQueryData<TaskWithAssigneesRow[]>(plannerKeys.myAssigned()) ?? [];
      const value = generateKeyBetween(null, lowestHint(cached));
      return plannerClient.setAssigneePriority({ task_id: v.task_id, value });
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: plannerKeys.myAssigned() });
      qc.invalidateQueries({ queryKey: plannerKeys.task(v.task_id) });
      toast.success('Moved to top of your list.');
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Could not move task to top.';
      toast.error(message);
    },
  });
}
