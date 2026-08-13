import { describe, expect, it } from 'vitest';
import { calendarEffort } from '../../src/utils/common.ts';

describe('calendarEffort', () => {
  it('is working days(start → end) / 22 × allocation, regardless of today', () => {
    // 2026-01-01 → 2026-04-01 = 65 working days (22 + 20 + 22 + 1); × 0.5 = 1.477... → 1.48.
    expect(calendarEffort('2026-01-01', '2026-04-01', 0.5)).toBe(1.48);
  });

  it('computes the same way whether the span is in the past or the future', () => {
    // 2099-01-01 → 2099-04-01 = 65 working days; × 1.0 = 2.95.
    expect(calendarEffort('2099-01-01', '2099-04-01', 1)).toBe(2.95);
  });

  it('calculates exact working days over 22 working days/month', () => {
    // 2026-01-01 → 2026-04-11 = 72 working days (64 + 8); 72 / 22 = 3.2727... → 3.27.
    expect(calendarEffort('2026-01-01', '2026-04-11', 1)).toBe(3.27);
  });

  it('allocation scales the result (0–1)', () => {
    // 65 working days × 0.4 / 22 = 1.18.
    expect(calendarEffort('2026-01-01', '2026-04-01', 0.4)).toBe(1.18);
  });

  it('counts 1 working day for a single weekday allocation', () => {
    // 2026-07-10 is Fri (1 working day): 1 / 22 = 0.05.
    expect(calendarEffort('2026-07-10', '2026-07-10', 1)).toBe(0.05);
  });

  it('returns 0 for a single weekend day allocation', () => {
    // 2026-07-11 is Sat (0 working days): 0.
    expect(calendarEffort('2026-07-11', '2026-07-11', 1)).toBe(0);
  });

  it('never returns a negative number when end precedes start', () => {
    expect(calendarEffort('2026-04-01', '2026-01-01', 1)).toBe(0);
  });
});
