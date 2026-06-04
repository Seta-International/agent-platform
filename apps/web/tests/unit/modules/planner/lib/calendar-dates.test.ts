import { describe, expect, it } from 'vitest';
import {
  addDaysKey,
  apiFrom,
  apiTo,
  currentMonthRange,
  currentWeekRange,
  deriveCalendarMode,
  endOfMonthKey,
  fromDateKey,
  rangeLabel,
  shiftRange,
  startOfMonthKey,
  startOfWeekKey,
  toDateKey,
  toModeRange,
} from '../../../../../src/modules/planner/lib/calendar-dates';

describe('calendar-dates', () => {
  it('round-trips date keys in UTC', () => {
    expect(toDateKey(new Date('2026-06-04T15:30:00Z'))).toBe('2026-06-04');
    expect(fromDateKey('2026-06-04').toISOString()).toBe('2026-06-04T00:00:00.000Z');
  });

  it('addDaysKey crosses month and year boundaries', () => {
    expect(addDaysKey('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDaysKey('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('startOfWeekKey is Monday-based', () => {
    expect(startOfWeekKey('2026-06-04')).toBe('2026-06-01'); // Thu → Mon
    expect(startOfWeekKey('2026-06-01')).toBe('2026-06-01'); // Mon → itself
    expect(startOfWeekKey('2026-06-07')).toBe('2026-06-01'); // Sun → previous Mon
  });

  it('month boundaries handle leap years and 30/31-day months', () => {
    expect(startOfMonthKey('2026-06-15')).toBe('2026-06-01');
    expect(endOfMonthKey('2026-06-15')).toBe('2026-06-30');
    expect(endOfMonthKey('2026-07-01')).toBe('2026-07-31');
    expect(endOfMonthKey('2028-02-10')).toBe('2028-02-29'); // leap year
  });

  it('current ranges derive from "now"', () => {
    const now = new Date('2026-06-04T10:00:00Z');
    expect(currentMonthRange(now)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
    expect(currentWeekRange(now)).toEqual({ from: '2026-06-01', to: '2026-06-07' });
  });

  it('deriveCalendarMode: exactly 7 days = week, anything else = month', () => {
    expect(deriveCalendarMode('2026-06-01', '2026-06-07')).toBe('week');
    expect(deriveCalendarMode('2026-06-01', '2026-06-30')).toBe('month');
  });

  it('shiftRange moves by a week in week mode and a calendar month in month mode', () => {
    expect(shiftRange('2026-06-01', '2026-06-07', 1)).toEqual({
      from: '2026-06-08',
      to: '2026-06-14',
    });
    expect(shiftRange('2026-06-01', '2026-06-30', 1)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
    expect(shiftRange('2026-06-01', '2026-06-30', -1)).toEqual({
      from: '2026-05-01',
      to: '2026-05-31',
    });
  });

  it('toModeRange converts an anchor day to a full week or month', () => {
    expect(toModeRange('2026-06-15', 'week')).toEqual({ from: '2026-06-15', to: '2026-06-21' });
    expect(toModeRange('2026-06-15', 'month')).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('rangeLabel formats month and week ranges', () => {
    expect(rangeLabel('2026-06-01', '2026-06-30')).toBe('June 2026');
    expect(rangeLabel('2026-06-01', '2026-06-07')).toBe('Jun 1 – Jun 7, 2026');
  });

  it('api instants cover whole UTC days inclusively', () => {
    expect(apiFrom('2026-06-01')).toBe('2026-06-01T00:00:00.000Z');
    expect(apiTo('2026-06-30')).toBe('2026-06-30T23:59:59.999Z');
  });
});
