import { describe, expect, it } from 'vitest';
import { anySignal } from '../../src/compose-signals';

describe('anySignal', () => {
  it('returns a non-aborted signal when all inputs are non-aborted', () => {
    const a = new AbortController();
    const b = new AbortController();
    const composed = anySignal([a.signal, b.signal]);
    expect(composed.aborted).toBe(false);
  });

  it('aborts when the first input aborts, carrying its reason', () => {
    const a = new AbortController();
    const b = new AbortController();
    const composed = anySignal([a.signal, b.signal]);
    const reason = new Error('first source');
    a.abort(reason);
    expect(composed.aborted).toBe(true);
    expect(composed.reason).toBe(reason);
  });

  it('aborts when the second input aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const composed = anySignal([a.signal, b.signal]);
    b.abort(new Error('second source'));
    expect(composed.aborted).toBe(true);
  });

  it('starts already-aborted when any input was aborted before composition', () => {
    const a = new AbortController();
    a.abort(new Error('pre-aborted'));
    const b = new AbortController();
    const composed = anySignal([a.signal, b.signal]);
    expect(composed.aborted).toBe(true);
  });

  it('ignores undefined entries (caller may pass an optional ctx.abortSignal)', () => {
    const a = new AbortController();
    const composed = anySignal([undefined, a.signal, undefined]);
    expect(composed.aborted).toBe(false);
    a.abort();
    expect(composed.aborted).toBe(true);
  });

  it('returns a non-aborted, never-firing signal when all inputs are undefined', () => {
    const composed = anySignal([undefined, undefined]);
    expect(composed.aborted).toBe(false);
  });

  it('removes listeners from non-firing inputs once one fires (no leaks)', () => {
    const a = new AbortController();
    const b = new AbortController();
    let bListenerCount = 0;
    const originalAdd = b.signal.addEventListener.bind(b.signal);
    const originalRemove = b.signal.removeEventListener.bind(b.signal);
    b.signal.addEventListener = ((type, listener, opts) => {
      if (type === 'abort') bListenerCount++;
      return originalAdd(type, listener, opts);
    }) as typeof b.signal.addEventListener;
    b.signal.removeEventListener = ((type, listener, opts) => {
      if (type === 'abort') bListenerCount--;
      return originalRemove(type, listener, opts);
    }) as typeof b.signal.removeEventListener;

    anySignal([a.signal, b.signal]);
    expect(bListenerCount).toBe(1);
    a.abort();
    expect(bListenerCount).toBe(0);
  });
});
