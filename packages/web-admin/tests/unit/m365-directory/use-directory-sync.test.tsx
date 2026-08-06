import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DirectorySyncStatus } from '../../../src/m365-directory/api/directory-sync-client.ts';
import {
  directoryConflictsQueryKey,
  directoryStatusQueryKey,
  useDirectoryConflicts,
  useDirectorySync,
  useResolveDirectoryConflict,
} from '../../../src/m365-directory/hooks/use-directory-sync.ts';

vi.mock('../../../src/m365-directory/api/directory-sync-client.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    listDirectoryConflicts: vi.fn(),
    getDirectorySyncStatus: vi.fn(),
    startDirectorySync: vi.fn(),
    resolveDirectoryConflict: vi.fn(),
  };
});

const client = await import('../../../src/m365-directory/api/directory-sync-client.ts');
const listConflicts = client.listDirectoryConflicts as ReturnType<typeof vi.fn>;
const getStatus = client.getDirectorySyncStatus as ReturnType<typeof vi.fn>;
const startSyncCall = client.startDirectorySync as ReturnType<typeof vi.fn>;
const resolveCall = client.resolveDirectoryConflict as ReturnType<typeof vi.fn>;

afterEach(() => vi.resetAllMocks());

function statusFixture(overrides: Partial<DirectorySyncStatus> = {}): DirectorySyncStatus {
  return {
    configured: true,
    last_synced_at: '2026-08-02T03:00:00.000Z',
    last_status: 'ok',
    last_error: null,
    cursor_present: true,
    last_run: {
      occurred_at: '2026-08-02T03:00:00.000Z',
      full: false,
      counters: { users_seen: 12 },
    },
    open_conflicts: 0,
    ...overrides,
  };
}

function harness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe('useDirectoryConflicts', () => {
  it('loads open conflicts by default', async () => {
    listConflicts.mockResolvedValue([{ id: 'c1', kind: 'user_removed', actions: ['ignore'] }]);
    const { wrapper } = harness();

    const { result } = renderHook(() => useDirectoryConflicts(), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(listConflicts).toHaveBeenCalledWith('open');
  });
});

describe('useResolveDirectoryConflict', () => {
  it('refreshes the queue and the run status after a resolution lands', async () => {
    resolveCall.mockResolvedValue({ resolved: true });
    const { qc, wrapper } = harness();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useResolveDirectoryConflict(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ conflictId: 'c1', action: 'ignore' });
    });

    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(directoryConflictsQueryKey('open')));
    expect(keys).toContain(JSON.stringify(directoryStatusQueryKey));
  });
});

describe('useDirectorySync', () => {
  it('is idle before anything is enqueued', async () => {
    getStatus.mockResolvedValue(statusFixture());
    const { wrapper } = harness();

    const { result } = renderHook(() => useDirectorySync(), { wrapper });

    await waitFor(() => expect(result.current.status?.configured).toBe(true));
    expect(result.current.isRunInFlight).toBe(false);
  });

  it('stays in flight after the enqueue until the run leaves a new mark on the status', async () => {
    getStatus.mockResolvedValue(statusFixture());
    startSyncCall.mockResolvedValue({ enqueued: true, full: true });
    const { qc, wrapper } = harness();

    const { result } = renderHook(() => useDirectorySync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBeDefined());

    await act(async () => {
      await result.current.startSync();
    });
    expect(startSyncCall).toHaveBeenCalledTimes(1);
    expect(result.current.isRunInFlight).toBe(true);

    // A poll that returns the same status must NOT clear it — the job is still queued.
    act(() => {
      qc.setQueryData(directoryStatusQueryKey, statusFixture());
    });
    expect(result.current.isRunInFlight).toBe(true);

    act(() => {
      qc.setQueryData(
        directoryStatusQueryKey,
        statusFixture({
          last_synced_at: '2026-08-02T04:00:00.000Z',
          last_run: {
            occurred_at: '2026-08-02T04:00:00.000Z',
            full: true,
            counters: { users_seen: 14 },
          },
        }),
      );
    });
    await waitFor(() => expect(result.current.isRunInFlight).toBe(false));
  });

  it('clears the in-flight state when the run ends in an error', async () => {
    getStatus.mockResolvedValue(statusFixture());
    startSyncCall.mockResolvedValue({ enqueued: true, full: true });
    const { qc, wrapper } = harness();

    const { result } = renderHook(() => useDirectorySync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBeDefined());
    await act(async () => {
      await result.current.startSync();
    });

    // A failed run never advances `last_synced_at`, so the watermark has to cover the outcome too.
    act(() => {
      qc.setQueryData(
        directoryStatusQueryKey,
        statusFixture({ last_status: 'error', last_error: 'Graph 403' }),
      );
    });
    await waitFor(() => expect(result.current.isRunInFlight).toBe(false));
  });

  it('reports an enqueue failure instead of pretending a run started', async () => {
    getStatus.mockResolvedValue(statusFixture());
    startSyncCall.mockRejectedValue(new Error('forbidden'));
    const { wrapper } = harness();

    const { result } = renderHook(() => useDirectorySync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBeDefined());
    await act(async () => {
      await result.current.startSync();
    });

    await waitFor(() => expect(result.current.startError?.message).toBe('forbidden'));
    expect(result.current.isRunInFlight).toBe(false);
  });
});
