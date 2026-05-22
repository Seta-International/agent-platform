import { useInfiniteQuery } from '@tanstack/react-query';
import { type NotificationDTO, notificationsClient } from '../api/client';
import { notificationKeys } from '../state/query-keys';

export function useNotifications(opts: { unread: boolean }): {
  items: NotificationDTO[];
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  isFetchingNextPage: boolean;
} {
  const q = useInfiniteQuery({
    queryKey: notificationKeys.list({ unread: opts.unread }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      notificationsClient.list({ unread: opts.unread, cursor: pageParam, limit: 30 }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  return {
    items: q.data?.pages.flatMap((p) => p.items) ?? [],
    isPending: q.isPending,
    isError: q.isError,
    hasNextPage: q.hasNextPage,
    fetchNextPage: q.fetchNextPage,
    isFetchingNextPage: q.isFetchingNextPage,
  };
}
