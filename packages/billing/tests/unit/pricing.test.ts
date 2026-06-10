import { describe, expect, it } from 'vitest';
import { periodKeys } from '../../src/period.ts';
import { priceFor } from '../../src/pricing.ts';

describe('priceFor', () => {
  it('returns configured prices for a known model', () => {
    const p = priceFor('openai/text-embedding-3-small');
    expect(p.in).toBeGreaterThan(0);
    expect(p.out).toBe(0);
  });

  it('returns zero prices for an unknown model', () => {
    expect(priceFor('unknown/model-x')).toEqual({ in: 0, out: 0 });
  });
});

describe('periodKeys', () => {
  it('derives UTC day and month keys', () => {
    const d = new Date('2026-06-10T23:30:00.000Z');
    expect(periodKeys(d)).toEqual({ day: '2026-06-10', month: '2026-06' });
  });

  it('uses UTC, not local time, at day boundary', () => {
    const d = new Date('2026-06-10T00:10:00.000Z');
    expect(periodKeys(d).day).toBe('2026-06-10');
  });
});
