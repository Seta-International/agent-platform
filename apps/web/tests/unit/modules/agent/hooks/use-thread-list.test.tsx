import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useThreadList } from '@/modules/agent/hooks/use-thread-list';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

  it('refetches on an interval while a recent thread is missing a title', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            threads: [
              // Recent + null title → should drive the poll.
              { id: 't1', title: null, updatedAt: new Date().toISOString() },
            ],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const qc = new QueryClient();
    renderHook(() => useThreadList(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    // Wait for the initial fetch plus at least one polled refetch.
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2), {
      timeout: 5000,
    });
  });

  it('does not poll once every thread has a title', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            threads: [{ id: 't1', title: 'done', updatedAt: new Date().toISOString() }],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const qc = new QueryClient();
    renderHook(() => useThreadList(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const initialCount = fetchSpy.mock.calls.length;
    // Pause to give the query a window to (incorrectly) re-poll if the gate is wrong.
    await new Promise((r) => setTimeout(r, 2500));
    expect(fetchSpy.mock.calls.length).toBe(initialCount);
  });
});
