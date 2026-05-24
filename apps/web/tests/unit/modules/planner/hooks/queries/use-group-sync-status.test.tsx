import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useGroupSyncStatus } from '../../../../../../src/modules/planner/hooks/queries/use-group-sync-status';
import { plannerKeys } from '../../../../../../src/modules/planner/state/query-keys';

const GROUP_ID = 'g1';
const STATUS_RESPONSE = {
  sync_status: 'synced',
  synced_at: '2026-01-01T00:00:00Z',
  last_error: null,
};

const server = setupServer(
  http.get(`/api/integrations/m365/groups/${GROUP_ID}/sync-status`, () =>
    HttpResponse.json(STATUS_RESPONSE),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper };
}

describe('useGroupSyncStatus', () => {
  it('fetches sync status when groupId is provided', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useGroupSyncStatus(GROUP_ID), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual(STATUS_RESPONSE);
  });

  it('is disabled when groupId is null', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useGroupSyncStatus(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('is disabled when groupId is undefined', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useGroupSyncStatus(undefined), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('uses the correct query key', async () => {
    const { qc, Wrapper } = makeWrapper();
    renderHook(() => useGroupSyncStatus(GROUP_ID), { wrapper: Wrapper });
    await waitFor(() =>
      expect(qc.getQueryData(plannerKeys.groupSyncStatus(GROUP_ID))).toBeDefined(),
    );
  });
});
