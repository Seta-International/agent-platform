import { describe, expect, it } from 'vitest';
import { calendarEffort } from '../../src/utils/common.ts';

describe('calendarEffort', () => {
  it('is months(start → end) × allocation, regardless of today', () => {
    // 2026-01-01 → 2026-04-01 = 90 days; 90 / 30 = 3.0 months; × 0.5 = 1.5.
    expect(calendarEffort('2026-01-01', '2026-04-01', 0.5)).toBe(1.5);
  });

  it('computes the same way whether the span is in the past or the future', () => {
    // A fully-future window still counts its own span (today is irrelevant).
    expect(calendarEffort('2099-01-01', '2099-04-01', 1)).toBe(3);
  });

  it('months are days / 30 rounded to 2 decimals', () => {
    // 100 days / 30 = 3.3333… → 3.33.
    expect(calendarEffort('2026-01-01', '2026-04-11', 1)).toBe(3.33);
  });

  it('allocation scales the result (0–1)', () => {
    // 90 days → 3.0 months × 0.4 = 1.2.
    expect(calendarEffort('2026-01-01', '2026-04-01', 0.4)).toBe(1.2);
  });

  it('is 0 for a same-day allocation', () => {
    expect(calendarEffort('2026-07-10', '2026-07-10', 1)).toBe(0);
  });

  it('never returns a negative number when end precedes start', () => {
    expect(calendarEffort('2026-04-01', '2026-01-01', 1)).toBe(0);
  });
});
