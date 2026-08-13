import { describe, expect, it } from 'vitest';
import { calendarEffort } from '../../src/utils/common.ts';

describe('calendarEffort', () => {
  it('calculates month-by-month effort based on actual working days per month (FUT-903)', () => {
    // 2026-01-01 → 2026-04-01: Jan (0.5) + Feb (0.5) + Mar (0.5) + Apr 1 (1/22 × 0.5 = 0.0227) = 1.5227 → 1.52.
    expect(calendarEffort('2026-01-01', '2026-04-01', 0.5)).toBe(1.52);
  });

  it('computes full year 100% allocation as exactly 12.0 MM (FUT-903)', () => {
    expect(calendarEffort('2026-01-01', '2026-12-31', 1)).toBe(12);
  });

  it('computes full month 100% allocation as exactly 1.0 MM for any month (FUT-903)', () => {
    expect(calendarEffort('2026-02-01', '2026-02-28', 1)).toBe(1);
    expect(calendarEffort('2026-07-01', '2026-07-31', 1)).toBe(1);
  });

  it('computes the same way whether the span is in the past or the future', () => {
    // 2099-01-01 → 2099-04-01 = 1.0 + 1.0 + 1.0 + (1/22 = 0.0455) = 3.0455 → 3.05.
    expect(calendarEffort('2099-01-01', '2099-04-01', 1)).toBe(3.05);
  });

  it('calculates exact working days over actual month working days', () => {
    // 2026-01-01 → 2026-04-11: Jan (1.0) + Feb (1.0) + Mar (1.0) + Apr 1–11 (8/22 = 0.3636) → 3.36.
    expect(calendarEffort('2026-01-01', '2026-04-11', 1)).toBe(3.36);
  });

  it('allocation scales the result (0–1)', () => {
    // 2026-01-01 → 2026-04-01 × 0.4: Jan (0.4) + Feb (0.4) + Mar (0.4) + Apr 1 (1/22 × 0.4 = 0.0182) → 1.22.
    expect(calendarEffort('2026-01-01', '2026-04-01', 0.4)).toBe(1.22);
  });

  it('counts 1 working day for a single weekday allocation out of month working days', () => {
    // 2026-07-10 is Fri (1 working day out of 23 working days in Jul 2026): 1 / 23 = 0.0434 → 0.04.
    expect(calendarEffort('2026-07-10', '2026-07-10', 1)).toBe(0.04);
  });

  it('returns 0 for a single weekend day allocation', () => {
    // 2026-07-11 is Sat (0 working days): 0.
    expect(calendarEffort('2026-07-11', '2026-07-11', 1)).toBe(0);
  });

  it('never returns a negative number when end precedes start', () => {
    expect(calendarEffort('2026-04-01', '2026-01-01', 1)).toBe(0);
  });
});
