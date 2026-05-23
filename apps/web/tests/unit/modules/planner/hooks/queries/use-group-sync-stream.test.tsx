import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGroupSyncStream } from '../../../../../../src/modules/planner/hooks/queries/use-group-sync-stream';
import { plannerKeys } from '../../../../../../src/modules/planner/state/query-keys';

const GROUP_ID = 'g1';

class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];
  url: string;
  withCredentials: boolean;
  readyState = 0;
  constructor(url: string, init?: EventSourceInit) {
    super();
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.readyState = 2;
  }
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
  FakeEventSource.instances = [];
});
afterEach(() => vi.unstubAllGlobals());

function makeWrapper() {
  const qc = new QueryClient();
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper };
}

describe('useGroupSyncStream', () => {
  it('opens EventSource at the correct URL when groupId is provided', () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useGroupSyncStream(GROUP_ID), { wrapper: Wrapper });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toBe(
      `/api/integrations/m365/groups/${GROUP_ID}/sync-status/stream`,
    );
    expect(FakeEventSource.instances[0]?.withCredentials).toBe(true);
  });

  it('does not open EventSource when groupId is null', () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useGroupSyncStream(null), { wrapper: Wrapper });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('does not open EventSource when groupId is undefined', () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useGroupSyncStream(undefined), { wrapper: Wrapper });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('updates the query cache when a sync-status event is received', () => {
    const { qc, Wrapper } = makeWrapper();
    renderHook(() => useGroupSyncStream(GROUP_ID), { wrapper: Wrapper });

    const es = FakeEventSource.instances[0];
    expect(es).toBeDefined();
    if (!es) return;

    const payload = { sync_status: 'synced', synced_at: '2026-01-01T00:00:00Z', last_error: null };
    act(() => {
      const event = new MessageEvent('sync-status', { data: JSON.stringify(payload) });
      es.dispatchEvent(event);
    });

    expect(qc.getQueryData(plannerKeys.groupSyncStatus(GROUP_ID))).toEqual(payload);
  });

  it('ignores malformed sync-status event data', () => {
    const { qc, Wrapper } = makeWrapper();
    renderHook(() => useGroupSyncStream(GROUP_ID), { wrapper: Wrapper });

    const es = FakeEventSource.instances[0];
    if (!es) return;

    act(() => {
      const event = new MessageEvent('sync-status', { data: 'not-json' });
      es.dispatchEvent(event);
    });

    expect(qc.getQueryData(plannerKeys.groupSyncStatus(GROUP_ID))).toBeUndefined();
  });

  it('encodes groupId in the URL', () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useGroupSyncStream('group/with spaces'), { wrapper: Wrapper });
    expect(FakeEventSource.instances[0]?.url).toContain('group%2Fwith%20spaces');
  });
});
