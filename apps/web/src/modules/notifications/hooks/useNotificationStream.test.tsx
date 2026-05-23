import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationKeys } from '../state/query-keys';
import { useNotificationStream } from './useNotificationStream';

class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  constructor(url: string) {
    super();
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
  FakeEventSource.instances = [];
});
afterEach(() => vi.unstubAllGlobals());

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('useNotificationStream', () => {
  it('opens an EventSource and invalidates notifications keys on "invalidate" event', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useNotificationStream(true), { wrapper: wrap(qc) });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toBe('/api/notifications/v1/stream');
    FakeEventSource.instances[0]?.dispatchEvent(new MessageEvent('invalidate', { data: '{}' }));
    expect(spy).toHaveBeenCalledWith({ queryKey: notificationKeys.all });
  });

  it('does not open when disabled', () => {
    const qc = new QueryClient();
    renderHook(() => useNotificationStream(false), { wrapper: wrap(qc) });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('closes the EventSource on unmount', () => {
    const qc = new QueryClient();
    const { unmount } = renderHook(() => useNotificationStream(true), { wrapper: wrap(qc) });
    const es = FakeEventSource.instances[0];
    unmount();
    expect(es?.closed).toBe(true);
  });
});
