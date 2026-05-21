import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useM365GroupSearch } from './use-m365-group-search';

const RESULTS = { groups: [{ id: 'mg1', displayName: 'Eng', mail: 'eng@corp.com' }] };

const server = setupServer(
  http.get('/api/integrations/m365/groups/search', () => HttpResponse.json(RESULTS)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useM365GroupSearch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is disabled when query < 2 chars', () => {
    const { result } = renderHook(() => useM365GroupSearch('a'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('is disabled for empty string', () => {
    const { result } = renderHook(() => useM365GroupSearch(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('enables and calls searchM365Groups for query >= 2 chars', async () => {
    const fetched = vi.fn();
    server.use(
      http.get('/api/integrations/m365/groups/search', () => {
        fetched();
        return HttpResponse.json(RESULTS);
      }),
    );

    const { result } = renderHook(() => useM365GroupSearch('en'), { wrapper });

    // advance past debounce (initial value is already 'en', query fires after mount)
    await act(() => vi.advanceTimersByTimeAsync(250));

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(fetched).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual(RESULTS);
  });

  it('only fires once with the final value after rapid typing', async () => {
    const fetched = vi.fn();
    server.use(
      http.get('/api/integrations/m365/groups/search', () => {
        fetched();
        return HttpResponse.json(RESULTS);
      }),
    );

    let query = 'e';
    const { result, rerender } = renderHook(() => useM365GroupSearch(query), { wrapper });

    query = 'en';
    rerender();
    query = 'eng';
    rerender();

    // Before debounce settles, nothing should fire
    expect(fetched).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(250));
    await waitFor(() => expect(result.current.data).toBeDefined());

    // Should only fire once with the final debounced value
    expect(fetched).toHaveBeenCalledOnce();
  });
});
