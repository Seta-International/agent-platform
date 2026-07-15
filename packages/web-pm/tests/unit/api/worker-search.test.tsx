import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkerSource } from '../../../src/api/worker-search';

afterEach(() => vi.restoreAllMocks());

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useWorkerSource', () => {
  it('maps People rows to searchable items on search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({ rows: [{ worker_id: 'w1', full_name: 'Alice' }] }),
          }) as unknown as Response,
      ),
    );
    const { result } = renderHook(() => useWorkerSource(), { wrapper: wrapper() });
    const out = await result.current.source.search('al');
    expect(out).toEqual([{ id: 'w1', label: 'Alice' }]);
  });

  it('seed() maps the endpoint rows to searchable items as-is, without filtering by id', async () => {
    // The real workers endpoint ignores the `ids` filter and returns the tenant's
    // full list — `seed()` here only maps rows through `mapRow`; it does not (and
    // is not meant to) filter or reorder by the requested id. That by-id guard
    // lives in the consuming hook (`useSeededItem`/`useSeededItems`), which is
    // exercised directly in use-seeded-item.test.tsx.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({
              rows: [
                { worker_id: 'w9', full_name: 'Zoe' },
                { worker_id: 'w1', full_name: 'Alice' },
              ],
            }),
          }) as unknown as Response,
      ),
    );
    const { result } = renderHook(() => useWorkerSource(), { wrapper: wrapper() });
    const out = await result.current.seed(['w1']);
    await waitFor(() =>
      expect(out).toEqual([
        { id: 'w9', label: 'Zoe' },
        { id: 'w1', label: 'Alice' },
      ]),
    );
  });
});
