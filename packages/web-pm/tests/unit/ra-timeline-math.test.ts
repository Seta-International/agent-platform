import { describe, expect, it } from 'vitest';
import {
  buildMonthColumns,
  monthColumnRange,
  monthKey,
  monthLabel,
  monthlyTotals,
  todayFraction,
} from '../../src/pages/ra-timeline-math';

describe('monthKey', () => {
  it('extracts YYYY-MM from an ISO date', () => {
    expect(monthKey('2026-04-09')).toBe('2026-04');
  });
});

describe('buildMonthColumns', () => {
  it('spans from the earliest start to the latest end across all segments', () => {
    const months = buildMonthColumns(
      [
        { date_from: '2026-04-09', date_to: '2026-12-23', planned_pct: 30 },
        { date_from: '2026-12-24', date_to: '2027-06-30', planned_pct: 100 },
      ],
      '2026-07-08',
    );
    expect(months[0]).toBe('2026-04');
    expect(months.at(-1)).toBe('2027-06');
  });

  it('always includes the current month even if every segment is in the future', () => {
    const months = buildMonthColumns(
      [{ date_from: '2027-01-01', date_to: '2027-03-31', planned_pct: 50 }],
      '2026-07-08',
    );
    expect(months[0]).toBe('2026-07');
  });

  it('adds a one-month buffer past an open-ended segment instead of clipping it flush', () => {
    const months = buildMonthColumns(
      [{ date_from: '2026-01-01', date_to: null, planned_pct: 50 }],
      '2026-07-08',
    );
    expect(months.at(-1)).toBe('2026-08');
  });
});

describe('monthColumnRange', () => {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];

  it('maps a segment to its whole-month column span, end exclusive', () => {
    expect(monthColumnRange(months, '2026-05-15', '2026-07-02')).toEqual({ start: 1, end: 4 });
  });

  it('runs an open-ended segment through the last available column', () => {
    expect(monthColumnRange(months, '2026-06-01', null)).toEqual({ start: 2, end: 5 });
  });

  it('clamps a start before the chart range to column 0', () => {
    expect(monthColumnRange(months, '2020-01-01', '2026-05-01')).toEqual({ start: 0, end: 2 });
  });
});

describe('todayFraction', () => {
  it('is a whole number at the start of a month', () => {
    const months = ['2026-06', '2026-07', '2026-08'];
    expect(todayFraction(months, '2026-07-01')).toBe(1);
  });

  it('is a fraction partway through the month', () => {
    const months = ['2026-06', '2026-07', '2026-08'];
    // Jul 16 of 31 days -> 1 + 15/31
    expect(todayFraction(months, '2026-07-16')).toBeCloseTo(1 + 15 / 31, 5);
  });

  it('clamps to the end when today is after every column', () => {
    const months = ['2026-06', '2026-07'];
    expect(todayFraction(months, '2027-01-01')).toBe(2);
  });
});

describe('monthlyTotals', () => {
  it('sums every segment that overlaps a given month at all', () => {
    const months = ['2026-06', '2026-07', '2026-08'];
    const totals = monthlyTotals(
      [
        { date_from: '2026-06-01', date_to: '2026-07-15', planned_pct: 30 },
        { date_from: '2026-07-01', date_to: '2026-08-31', planned_pct: 100 },
      ],
      months,
    );
    expect(totals).toEqual([30, 130, 100]);
  });

  it('treats an open-ended segment as overlapping every later month', () => {
    const months = ['2026-06', '2026-07', '2026-08'];
    const totals = monthlyTotals(
      [{ date_from: '2026-07-01', date_to: null, planned_pct: 50 }],
      months,
    );
    expect(totals).toEqual([0, 50, 50]);
  });

  it('counts a segment ending on the exact last day of the month (UTC-safe boundary)', () => {
    const months = ['2026-06', '2026-07'];
    const totals = monthlyTotals(
      [{ date_from: '2026-06-01', date_to: '2026-06-30', planned_pct: 40 }],
      months,
    );
    expect(totals).toEqual([40, 0]);
  });

  it('counts a segment starting on the exact first day of a 28-day February', () => {
    const months = ['2026-01', '2026-02', '2026-03'];
    const totals = monthlyTotals(
      [{ date_from: '2026-02-28', date_to: '2026-03-01', planned_pct: 20 }],
      months,
    );
    expect(totals).toEqual([0, 20, 20]);
  });

  it('FUT-851: calculates monthly total as peak daily allocation for consecutive non-overlapping segments', () => {
    const months = ['2026-09'];
    const totals = monthlyTotals(
      [
        { date_from: '2026-09-01', date_to: '2026-09-15', planned_pct: 100 },
        { date_from: '2026-09-16', date_to: '2026-09-30', planned_pct: 100 },
      ],
      months,
    );
    expect(totals).toEqual([100]);
  });

  it('FUT-851: calculates peak daily allocation when segments partially overlap in a month', () => {
    const months = ['2026-09'];
    const totals = monthlyTotals(
      [
        { date_from: '2026-09-01', date_to: '2026-09-20', planned_pct: 60 },
        { date_from: '2026-09-10', date_to: '2026-09-30', planned_pct: 50 },
      ],
      months,
    );
    expect(totals).toEqual([110]);
  });
});

describe('monthLabel', () => {
  it('formats YYYY-MM as a short month + year', () => {
    expect(monthLabel('2026-04')).toBe('Apr 2026');
  });
});
