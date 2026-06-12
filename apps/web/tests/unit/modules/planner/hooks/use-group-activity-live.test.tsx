import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGroupActivityLive } from '../../../../../src/modules/planner/hooks/use-group-activity-live';

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
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
  FakeEventSource.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function makeWrapper(qc: QueryClient) {
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useGroupActivityLive', () => {
  it('opens EventSource scoped to the group id', () => {
    const qc = new QueryClient();
    renderHook(() => useGroupActivityLive('g1'), { wrapper: makeWrapper(qc) });
    expect(FakeEventSource.instances[0]?.url).toContain('group_ids=g1');
  });

  it('counts pending events and debounces a single refetch', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useGroupActivityLive('g1'), { wrapper: makeWrapper(qc) });

    const es = FakeEventSource.instances[0];
    expect(es).toBeDefined();
    if (!es) return;

    act(() => {
      es.dispatchEvent(new Event('planner.task.moved'));
      es.dispatchEvent(new Event('planner.task.created'));
    });
    expect(result.current.pendingCount).toBe(2);
    expect(spy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Debounced refetch fired (feed + rail) and the pending counter reset.
    expect(spy).toHaveBeenCalled();
    expect(result.current.pendingCount).toBe(0);
  });

  it('closes the EventSource on unmount', () => {
    const qc = new QueryClient();
    const { unmount } = renderHook(() => useGroupActivityLive('g1'), { wrapper: makeWrapper(qc) });
    const es = FakeEventSource.instances[0];
    if (!es) return;
    unmount();
    expect(es.readyState).toBe(2);
  });
});
