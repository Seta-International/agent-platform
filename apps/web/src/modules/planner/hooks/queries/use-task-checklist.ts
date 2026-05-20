import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useTaskChecklist(taskId: string) {
  return useQuery({
    queryKey: plannerKeys.taskChecklist(taskId),
    queryFn: () => plannerClient.listChecklistItems(taskId),
    enabled: !!taskId,
  });
}
