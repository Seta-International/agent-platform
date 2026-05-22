import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useNotifications } from './useNotifications';

vi.mock('../api/client', () => ({
  notificationsClient: {
    list: vi.fn(async ({ cursor }: { cursor?: string }) => ({
      items: [
        { id: cursor ?? 'first', event_type: 't', payload: {}, created_at: 'x', read_at: null },
      ],
      next_cursor: cursor ? null : 'page2',
    })),
  },
}));

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useNotifications', () => {
  it('paginates via next_cursor', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNotifications({ unread: false }), {
      wrapper: wrap(qc),
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasNextPage).toBe(true);
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
  });
});
