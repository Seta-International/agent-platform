import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetBucketsForTesting, acquireToken } from '../../../src/m365/token-bucket.ts';

describe('token bucket', () => {
  beforeEach(() => {
    _resetBucketsForTesting();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('first 10 acquireToken calls resolve immediately', async () => {
    for (let i = 0; i < 10; i++) await acquireToken('tenant-1');
    // All 10 tokens consumed without needing any timer advance
  });

  it('11th call waits until a refill becomes available', async () => {
    for (let i = 0; i < 10; i++) await acquireToken('tenant-1');

    const start = performance.now();
    const pending = acquireToken('tenant-1');
    vi.advanceTimersByTime(100); // advance 100ms — enough for 1 token refill
    await pending;
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(99);
  });

  it('separate tenants have independent buckets', async () => {
    for (let i = 0; i < 10; i++) await acquireToken('tenant-A');
    // tenant-B bucket is fresh — these 10 calls must not be throttled
    for (let i = 0; i < 10; i++) await acquireToken('tenant-B');
  });
});
