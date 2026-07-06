import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useAssigneeSuggestions(taskId: string, enabled: boolean) {
  return useQuery({
    queryKey: plannerKeys.taskAssigneeSuggestions(taskId),
    queryFn: () => plannerClient.getAssigneeSuggestions(taskId),
    enabled: enabled && taskId.length > 0,
    staleTime: 60_000, // advisory; recompute at most once/min per open task
  });
}
