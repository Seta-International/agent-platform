import { describe, expect, it } from 'vitest';
import { RECENT_WEEK_COUNT, recentIsoWeeks } from '../../src/pages/kpi-shared';

describe('recentIsoWeeks', () => {
  it('offers 5 weeks — the current one plus the 4 before it, newest first', () => {
    const weeks = recentIsoWeeks({ iso_year: 2026, iso_week: 32 });
    expect(RECENT_WEEK_COUNT).toBe(5);
    expect(weeks).toHaveLength(5);
    expect(weeks.map((w) => w.iso_week)).toEqual([32, 31, 30, 29, 28]);
    expect(weeks.every((w) => w.iso_year === 2026)).toBe(true);
  });

  it('marks only the anchor week as current', () => {
    const weeks = recentIsoWeeks({ iso_year: 2026, iso_week: 32 });
    expect(weeks[0]?.label).toBe('2026-W32 (current)');
    expect(weeks.slice(1).some((w) => w.label.includes('current'))).toBe(false);
  });

  it('walks back across the year boundary into the previous ISO year', () => {
    const weeks = recentIsoWeeks({ iso_year: 2027, iso_week: 3 });
    expect(weeks.map((w) => `${w.iso_year}-${w.iso_week}`)).toEqual([
      '2027-3',
      '2027-2',
      '2027-1',
      '2026-53',
      '2026-52',
    ]);
  });

  it('never repeats a week', () => {
    const keys = recentIsoWeeks({ iso_year: 2026, iso_week: 1 }).map(
      (w) => `${w.iso_year}-${w.iso_week}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
