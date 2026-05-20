import { useInfiniteQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useTaskEvents(taskId: string) {
  return useInfiniteQuery({
    queryKey: plannerKeys.taskEvents(taskId),
    queryFn: ({ pageParam }) =>
      plannerClient.listTaskEvents({
        task_id: taskId,
        limit: 20,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
    enabled: !!taskId,
  });
}
