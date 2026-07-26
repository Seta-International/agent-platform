import { describe, expect, it } from 'vitest';
import { currentMonth, performanceContextOptions } from '../../src/api/performance-query.ts';

describe('performanceContextOptions', () => {
  it('keys the cache by month (ticket: ["orgTree", asOfMonth])', () => {
    expect(performanceContextOptions('2026-07').queryKey).toEqual([
      'people',
      'performance',
      'context',
      '2026-07',
    ]);
  });

  it('currentMonth returns YYYY-MM', () => {
    expect(currentMonth()).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it('currentMonth uses VN wall across the UTC month boundary', () => {
    // 2026-08-01 00:30 VN = 2026-07-31 17:30 UTC
    const vnAug1 = new Date(Date.UTC(2026, 7, 1, 0, 30) - 7 * 3_600_000);
    expect(currentMonth(vnAug1)).toBe('2026-08');
    expect(vnAug1.toISOString().slice(0, 7)).toBe('2026-07');
  });
});
