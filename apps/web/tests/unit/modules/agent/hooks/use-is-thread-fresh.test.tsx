import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useIsThreadFresh } from '@/modules/agent/hooks/use-is-thread-fresh';
import { markThreadFresh, markThreadKnown } from '@/modules/agent/lib/fresh-thread-store';

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  window.sessionStorage.clear();
});

describe('useIsThreadFresh', () => {
  it('returns false for an id never marked fresh', () => {
    const { result } = renderHook(() => useIsThreadFresh('x'));
    expect(result.current).toBe(false);
  });

  it('flips to true when the id is marked fresh and false when marked known', () => {
    const { result } = renderHook(() => useIsThreadFresh('x'));
    expect(result.current).toBe(false);
    act(() => markThreadFresh('x'));
    expect(result.current).toBe(true);
    act(() => markThreadKnown('x'));
    expect(result.current).toBe(false);
  });

  it('does not flip when an unrelated id mutates', () => {
    markThreadFresh('other');
    const { result } = renderHook(() => useIsThreadFresh('x'));
    expect(result.current).toBe(false);
    act(() => markThreadKnown('other'));
    expect(result.current).toBe(false);
  });
});
