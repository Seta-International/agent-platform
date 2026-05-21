import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { useLinkGroupToM365 } from './link-group-to-m365';
import { useRefreshGroupSync } from './refresh-group-sync';
import { useResolveGroupConflict } from './resolve-group-conflict';
import { useUnlinkGroupFromM365 } from './unlink-group-from-m365';

const GROUP_ID = 'g1';
const FAKE_GROUP = {
  id: GROUP_ID,
  name: 'Eng',
  tenant_id: 't',
  created_by: 'u1',
  created_at: '',
  updated_at: '',
  deleted_at: null,
  version: 1,
};

const server = setupServer(
  http.post(`/api/integrations/m365/groups/${GROUP_ID}/link`, () => HttpResponse.json(FAKE_GROUP)),
  http.post(`/api/integrations/m365/groups/${GROUP_ID}/unlink`, () =>
    HttpResponse.json(FAKE_GROUP),
  ),
  http.post(`/api/integrations/m365/groups/${GROUP_ID}/refresh`, () =>
    HttpResponse.json({ ok: true }),
  ),
  http.post(`/api/integrations/m365/groups/${GROUP_ID}/resolve`, () =>
    HttpResponse.json({ ok: true }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper, invalidate };
}

describe('useLinkGroupToM365', () => {
  it('on success, invalidates groupsWithCounts and groupSyncStatus', async () => {
    const { Wrapper, invalidate } = makeWrapper();
    const { result } = renderHook(() => useLinkGroupToM365(GROUP_ID), { wrapper: Wrapper });

    act(() => result.current.mutate('ext-123'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.groupsWithCounts() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.groupSyncStatus(GROUP_ID) });
  });
});

describe('useUnlinkGroupFromM365', () => {
  it('on success, invalidates groupsWithCounts and groupSyncStatus', async () => {
    const { Wrapper, invalidate } = makeWrapper();
    const { result } = renderHook(() => useUnlinkGroupFromM365(GROUP_ID), { wrapper: Wrapper });

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.groupsWithCounts() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.groupSyncStatus(GROUP_ID) });
  });
});

describe('useRefreshGroupSync', () => {
  it('on success, invalidates groupsWithCounts and groupSyncStatus', async () => {
    const { Wrapper, invalidate } = makeWrapper();
    const { result } = renderHook(() => useRefreshGroupSync(GROUP_ID), { wrapper: Wrapper });

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.groupsWithCounts() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.groupSyncStatus(GROUP_ID) });
  });
});

describe('useResolveGroupConflict', () => {
  it('on success, invalidates groupsWithCounts and groupSyncStatus', async () => {
    const { Wrapper, invalidate } = makeWrapper();
    const { result } = renderHook(() => useResolveGroupConflict(GROUP_ID), { wrapper: Wrapper });

    act(() => result.current.mutate([{ field: 'name', choice: 'local' }]));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.groupsWithCounts() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.groupSyncStatus(GROUP_ID) });
  });
});
