import type { GroupMemberRow } from '@seta/planner';
import { useInfiniteQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

const PAGE_SIZE = 20;

export function useGroupMembers(groupId: string) {
  return useInfiniteQuery({
    queryKey: plannerKeys.groupMembers(groupId),
    queryFn: ({ pageParam }) =>
      plannerClient.listGroupMembers(groupId, { limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.members.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !!groupId,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      members: data.pages.flatMap((p) => p.members) as ReadonlyArray<GroupMemberRow>,
      total: data.pages[0]?.total ?? 0,
    }),
  });
}
