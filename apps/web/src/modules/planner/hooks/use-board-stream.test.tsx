import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStatus } from '../state/connection-status';
import { useBoardStream } from './use-board-stream';

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
  useConnectionStatus.setState({ status: 'idle' });
});
afterEach(() => vi.unstubAllGlobals());

const wrapper = ({ children }: PropsWithChildren) => {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useBoardStream', () => {
  it('opens EventSource with the comma-joined group ids', () => {
    renderHook(() => useBoardStream(['g1', 'g2']), { wrapper });
    expect(FakeEventSource.instances[0]?.url).toMatch(/group_ids=g1%2Cg2/);
  });

  it('does not open when group ids empty', () => {
    renderHook(() => useBoardStream([]), { wrapper });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('transitions status to open on open event', () => {
    renderHook(() => useBoardStream(['g1']), { wrapper });
    const es = FakeEventSource.instances[0];
    expect(es).toBeDefined();
    if (!es) return;
    act(() => {
      es.dispatchEvent(new Event('open'));
    });
    expect(useConnectionStatus.getState().status).toBe('open');
  });

  it('transitions status to reconnecting on error', () => {
    renderHook(() => useBoardStream(['g1']), { wrapper });
    const es = FakeEventSource.instances[0];
    if (!es) return;
    act(() => {
      es.dispatchEvent(new Event('error'));
    });
    expect(useConnectionStatus.getState().status).toBe('reconnecting');
  });
});
