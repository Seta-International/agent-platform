import { describe, expect, it, vi } from 'vitest';
import { CoalescingEmitter } from '../../src/backend/workflows/_infra/coalescing-emitter.ts';

describe('CoalescingEmitter', () => {
  it('coalesces updates per key to one emission per window', async () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn();
      const c = new CoalescingEmitter<{ runId: string; n: number }>({
        windowMs: 1000,
        keyFn: (e) => e.runId,
        emit,
      });
      c.push({ runId: 'r1', n: 1 });
      c.push({ runId: 'r1', n: 2 });
      c.push({ runId: 'r1', n: 3 });
      c.push({ runId: 'r2', n: 4 });
      await vi.advanceTimersByTimeAsync(1100);
      expect(emit).toHaveBeenCalledTimes(2);
      // The last r1 event should win; r2 should be present
      const args = emit.mock.calls.map((c) => c[0]);
      expect(args.find((a) => a.runId === 'r1')).toMatchObject({ runId: 'r1', n: 3 });
      expect(args.find((a) => a.runId === 'r2')).toMatchObject({ runId: 'r2', n: 4 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts a fresh window after flush', async () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn();
      const c = new CoalescingEmitter<{ runId: string }>({
        windowMs: 500,
        keyFn: (e) => e.runId,
        emit,
      });
      c.push({ runId: 'r1' });
      await vi.advanceTimersByTimeAsync(600);
      c.push({ runId: 'r1' });
      await vi.advanceTimersByTimeAsync(600);
      expect(emit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('dispose() cancels pending emissions', async () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn();
      const c = new CoalescingEmitter<{ runId: string }>({
        windowMs: 500,
        keyFn: (e) => e.runId,
        emit,
      });
      c.push({ runId: 'r1' });
      c.dispose();
      await vi.advanceTimersByTimeAsync(600);
      expect(emit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
