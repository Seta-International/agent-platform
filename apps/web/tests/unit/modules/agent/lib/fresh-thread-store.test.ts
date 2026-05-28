import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isThreadFresh,
  markThreadFresh,
  markThreadKnown,
  snapshotFreshThreadIds,
  subscribeFreshThreads,
} from '@/modules/agent/lib/fresh-thread-store';

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  window.sessionStorage.clear();
});

describe('fresh-thread-store', () => {
  it('treats unknown ids as not fresh', () => {
    expect(isThreadFresh('nope')).toBe(false);
    expect(isThreadFresh(undefined)).toBe(false);
  });

  it('marks ids fresh and known', () => {
    markThreadFresh('a');
    expect(isThreadFresh('a')).toBe(true);
    expect([...snapshotFreshThreadIds()]).toEqual(['a']);
    markThreadKnown('a');
    expect(isThreadFresh('a')).toBe(false);
  });

  it('notifies subscribers on mutation', () => {
    const sub = vi.fn();
    const unsub = subscribeFreshThreads(sub);
    markThreadFresh('x');
    markThreadFresh('x'); // no-op (already in set)
    markThreadFresh('y');
    markThreadKnown('x');
    markThreadKnown('x'); // no-op (already removed)
    unsub();
    markThreadFresh('z'); // post-unsubscribe — should NOT fire
    expect(sub).toHaveBeenCalledTimes(3);
  });

  it('persists across reads via sessionStorage', () => {
    markThreadFresh('persisted');
    // Re-read via the snapshot helper to simulate a fresh module read.
    expect([...snapshotFreshThreadIds()]).toEqual(['persisted']);
  });

  it('tolerates malformed storage entries', () => {
    window.sessionStorage.setItem('seta.agent.freshThreadIds', 'not-json');
    expect(isThreadFresh('x')).toBe(false);
    expect([...snapshotFreshThreadIds()]).toEqual([]);
  });
});
