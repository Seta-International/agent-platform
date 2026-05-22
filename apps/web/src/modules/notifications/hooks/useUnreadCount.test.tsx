import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useUnreadCount } from './useUnreadCount';

vi.mock('../api/client', () => ({
  notificationsClient: { unreadCount: vi.fn(async () => ({ count: 7 })) },
}));

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('useUnreadCount', () => {
  it('returns count', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.count).toBe(7));
  });
});
