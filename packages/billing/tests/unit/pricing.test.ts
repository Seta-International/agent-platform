import { describe, expect, it } from 'vitest';
import { periodKeys } from '../../src/period.ts';

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
