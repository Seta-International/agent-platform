import { useInfiniteQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useComments(taskId: string) {
  return useInfiniteQuery({
    queryKey: plannerKeys.taskComments(taskId),
    queryFn: ({ pageParam }) =>
      plannerClient.listComments(taskId, { cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
    enabled: !!taskId,
  });
}
