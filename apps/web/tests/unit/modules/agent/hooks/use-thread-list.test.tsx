import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useThreadList } from '@/modules/agent/hooks/use-thread-list';

describe('useThreadList', () => {
  it('groups threads into Today / Earlier this week / Older', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              threads: [
                { id: 't1', title: 'a', updatedAt: new Date().toISOString() },
                {
                  id: 't2',
                  title: 'b',
                  updatedAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
                },
                {
                  id: 't3',
                  title: 'c',
                  updatedAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
                },
              ],
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const qc = new QueryClient();
    const { result } = renderHook(() => useThreadList(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const labels = result.current.groups!.map((g) => g.label);
    expect(labels).toEqual(['Today', 'Earlier this week', 'Older']);
  });
});
