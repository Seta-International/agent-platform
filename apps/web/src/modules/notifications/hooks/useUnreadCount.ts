import { useQuery } from '@tanstack/react-query';
import { notificationsClient } from '../api/client';
import { notificationKeys } from '../state/query-keys';

export function useUnreadCount(): { count: number; isPending: boolean } {
  const q = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationsClient.unreadCount(),
  });
  return { count: q.data?.count ?? 0, isPending: q.isPending };
}
