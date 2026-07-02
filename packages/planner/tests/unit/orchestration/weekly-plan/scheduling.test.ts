// packages/planner/tests/unit/orchestration/weekly-plan/scheduling.test.ts
import { describe, expect, it } from 'vitest';
import {
  resolvePlanWindow,
  resolveWeekChoice,
} from '../../../../src/backend/orchestration/weekly-plan/scheduling.ts';

describe('resolveWeekChoice', () => {
  it('defaults to this week', () => {
    expect(resolveWeekChoice('plan my week')).toBe('this');
    expect(resolveWeekChoice('organize my tasks')).toBe('this');
  });

  it('detects next week in English and Vietnamese', () => {
    expect(resolveWeekChoice('plan next week for me')).toBe('next');
    expect(resolveWeekChoice('what should the upcoming week look like')).toBe('next');
    expect(resolveWeekChoice('lập kế hoạch tuần sau')).toBe('next');
    expect(resolveWeekChoice('sắp xếp công việc tuần tới')).toBe('next');
  });
});

describe('resolvePlanWindow (UTC-pinned)', () => {
  const at = (iso: string) => new Date(`${iso}T09:00:00Z`);

  it('Monday ask, this week → full Mon–Fri', () => {
    expect(resolvePlanWindow(at('2026-07-06'), 'this', 'UTC')).toEqual({
      startDay: 'mon',
      endDay: 'fri',
      weekStart: '2026-07-06',
      weekEnd: '2026-07-10',
    });
  });

  it('Wednesday ask, this week → starts Wednesday (mid-week rule)', () => {
    expect(resolvePlanWindow(at('2026-07-08'), 'this', 'UTC')).toEqual({
      startDay: 'wed',
      endDay: 'fri',
      weekStart: '2026-07-08',
      weekEnd: '2026-07-10',
    });
  });

  it('Friday ask, this week → single-day window', () => {
    expect(resolvePlanWindow(at('2026-07-10'), 'this', 'UTC')).toEqual({
      startDay: 'fri',
      endDay: 'fri',
      weekStart: '2026-07-10',
      weekEnd: '2026-07-10',
    });
  });

  it('Saturday and Sunday ask, this week → rolls to the upcoming Mon–Fri', () => {
    const expected = {
      startDay: 'mon',
      endDay: 'fri',
      weekStart: '2026-07-13',
      weekEnd: '2026-07-17',
    };
    expect(resolvePlanWindow(at('2026-07-11'), 'this', 'UTC')).toEqual(expected);
    expect(resolvePlanWindow(at('2026-07-12'), 'this', 'UTC')).toEqual(expected);
  });

  it('weekday ask, next week → next Mon–Fri', () => {
    expect(resolvePlanWindow(at('2026-07-08'), 'next', 'UTC')).toEqual({
      startDay: 'mon',
      endDay: 'fri',
      weekStart: '2026-07-13',
      weekEnd: '2026-07-17',
    });
  });

  it('weekend ask, next week → the imminent Mon–Fri (same as weekend this-week)', () => {
    expect(resolvePlanWindow(at('2026-07-11'), 'next', 'UTC')).toEqual({
      startDay: 'mon',
      endDay: 'fri',
      weekStart: '2026-07-13',
      weekEnd: '2026-07-17',
    });
  });

  it('resolves "today" in the given IANA timezone, not the server zone', () => {
    // 18:00 UTC on Monday 2026-07-06 is already Tuesday 01:00 in Asia/Ho_Chi_Minh (UTC+7).
    const w = resolvePlanWindow(new Date('2026-07-06T18:00:00Z'), 'this', 'Asia/Ho_Chi_Minh');
    expect(w.startDay).toBe('tue');
    expect(w.weekStart).toBe('2026-07-07');
    expect(w.weekEnd).toBe('2026-07-10');
  });
});
