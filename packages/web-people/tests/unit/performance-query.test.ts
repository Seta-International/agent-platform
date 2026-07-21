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
});
