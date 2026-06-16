import { useInfiniteQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useGroupActivityFeed(groupId: string) {
  return useInfiniteQuery({
    queryKey: plannerKeys.groupActivityFeed(groupId),
    queryFn: ({ pageParam }) =>
      plannerClient.getGroupActivity(groupId, {
        cursor: pageParam as string | undefined,
        limit: 30,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
    enabled: !!groupId,
    refetchInterval: 120_000,
  });
}
