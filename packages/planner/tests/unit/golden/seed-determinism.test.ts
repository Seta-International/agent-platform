import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateBulkEvents } from '../../fixtures/golden/events.ts';

describe('golden events are wall-clock independent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('produces identical occurred_at across system times', () => {
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const a = generateBulkEvents().map((e) => e.occurred_at.getTime());
    vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
    const b = generateBulkEvents().map((e) => e.occurred_at.getTime());
    expect(a).toEqual(b);
  });
});
