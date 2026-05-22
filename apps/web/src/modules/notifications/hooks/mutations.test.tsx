import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { notificationKeys } from '../state/query-keys';
import { useMarkAllRead, useMarkRead } from './mutations';

vi.mock('../api/client', () => ({
  notificationsClient: {
    markRead: vi.fn(async (id: string) => ({
      id,
      event_type: 't',
      payload: {},
      created_at: 'x',
      read_at: 'now',
    })),
    markAllRead: vi.fn(async () => ({ updated: 5 })),
    dismiss: vi.fn(),
  },
}));

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('useMarkRead', () => {
  it('optimistically decrements unread-count', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(notificationKeys.unreadCount(), { count: 3 });
    const { result } = renderHook(() => useMarkRead(), { wrapper: wrap(qc) });
    await result.current.mutateAsync('abc');
    await waitFor(() => {
      expect(qc.getQueryData(notificationKeys.unreadCount())).toEqual({ count: 2 });
    });
  });
});

describe('useMarkAllRead', () => {
  it('sets unread-count to 0 optimistically', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(notificationKeys.unreadCount(), { count: 7 });
    const { result } = renderHook(() => useMarkAllRead(), { wrapper: wrap(qc) });
    await result.current.mutateAsync();
    expect(qc.getQueryData(notificationKeys.unreadCount())).toEqual({ count: 0 });
  });
});
