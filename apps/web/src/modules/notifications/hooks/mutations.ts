import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsClient } from '../api/client';
import { notificationKeys } from '../state/query-keys';

function getCount(qc: ReturnType<typeof useQueryClient>): number {
  const data = qc.getQueryData<{ count: number }>(notificationKeys.unreadCount());
  return data?.count ?? 0;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsClient.markRead(id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: notificationKeys.unreadCount() });
      const prev = getCount(qc);
      qc.setQueryData(notificationKeys.unreadCount(), { count: Math.max(prev - 1, 0) });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(notificationKeys.unreadCount(), { count: ctx.prev });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsClient.markAllRead(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: notificationKeys.unreadCount() });
      const prev = getCount(qc);
      qc.setQueryData(notificationKeys.unreadCount(), { count: 0 });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(notificationKeys.unreadCount(), { count: ctx.prev });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useDismiss() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsClient.dismiss(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
