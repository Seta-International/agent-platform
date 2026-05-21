import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useTaskDetail(taskId: string) {
  return useQuery({
    queryKey: plannerKeys.task(taskId),
    queryFn: () => plannerClient.getTask(taskId),
    staleTime: 30_000,
    enabled: !!taskId,
  });
}
