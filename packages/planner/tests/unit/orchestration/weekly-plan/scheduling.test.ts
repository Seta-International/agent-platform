// packages/planner/tests/unit/orchestration/weekly-plan/scheduling.test.ts
import { describe, expect, it } from 'vitest';
import {
  capacityHint,
  prePassOrder,
  resolvePlanWindow,
  resolveWeekChoice,
  validatePlan,
  windowDays,
} from '../../../../src/backend/orchestration/weekly-plan/scheduling.ts';
import type {
  NormalizedTask,
  PlanWindow,
} from '../../../../src/backend/orchestration/weekly-plan/schemas.ts';

const task = (over: Partial<NormalizedTask> & { title: string }): NormalizedTask => ({
  priority: 'medium',
  priorityAssumed: false,
  dueAt: null,
  dueAssumed: false,
  overdue: false,
  ...over,
});

const WED_FRI: PlanWindow = {
  startDay: 'wed',
  endDay: 'fri',
  weekStart: '2026-07-08',
  weekEnd: '2026-07-10',
};

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

describe('prePassOrder', () => {
  it('orders overdue first, then due date (nulls last), then priority', () => {
    const ordered = prePassOrder([
      task({ title: 'no-due low', priority: 'low' }),
      task({ title: 'due-fri', dueAt: '2026-07-10' }),
      task({ title: 'overdue', dueAt: '2026-07-01', overdue: true }),
      task({ title: 'due-thu urgent', dueAt: '2026-07-09', priority: 'urgent' }),
      task({ title: 'no-due urgent', priority: 'urgent' }),
    ]);
    expect(ordered.map((t) => t.title)).toEqual([
      'overdue',
      'due-thu urgent',
      'due-fri',
      'no-due urgent',
      'no-due low',
    ]);
  });

  it('does not mutate its input', () => {
    const input = [task({ title: 'b' }), task({ title: 'a', priority: 'urgent' })];
    prePassOrder(input);
    expect(input[0]!.title).toBe('b');
  });
});

describe('windowDays / capacityHint', () => {
  it('lists only the days from startDay', () => {
    expect(windowDays(WED_FRI)).toEqual(['wed', 'thu', 'fri']);
  });

  it('capacity is ceil(tasks / remaining days)', () => {
    expect(capacityHint(7, WED_FRI)).toBe(3); // 7 tasks / 3 days
    expect(capacityHint(3, WED_FRI)).toBe(1);
  });
});

describe('validatePlan', () => {
  const tasks = [
    task({ title: 'A', dueAt: '2026-07-09' }), // due Thursday
    task({ title: 'B' }),
  ];
  const plan = (
    days: { day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri'; titles: string[] }[],
    unplaced: string[] = [],
  ) => ({
    days: days.map((d) => ({ day: d.day, blocks: [{ label: 'Focus', taskTitles: d.titles }] })),
    unplaced,
  });

  it('accepts a plan that places every task once, inside the window, on/before its due day', () => {
    const v = validatePlan(
      plan([
        { day: 'wed', titles: ['A'] },
        { day: 'fri', titles: ['B'] },
      ]),
      tasks,
      WED_FRI,
    );
    expect(v).toEqual({ ok: true, violations: [] });
  });

  it('flags days outside the window', () => {
    const v = validatePlan(plan([{ day: 'mon', titles: ['A', 'B'] }]), tasks, WED_FRI);
    expect(v.ok).toBe(false);
    expect(v.violations.join(' ')).toContain('outside the planning window');
  });

  it('flags missing, duplicated, unknown, and unplaced tasks', () => {
    const v = validatePlan(
      plan([{ day: 'wed', titles: ['A', 'A', 'Ghost'] }], ['B']),
      tasks,
      WED_FRI,
    );
    expect(v.ok).toBe(false);
    expect(v.violations.join(' ')).toContain('"A" placed 2');
    expect(v.violations.join(' ')).toContain('unknown task "Ghost"');
    expect(v.violations.join(' ')).toContain('unplaced tasks: B');
  });

  it('flags a task placed after its due day', () => {
    const v = validatePlan(
      plan([
        { day: 'fri', titles: ['A'] },
        { day: 'wed', titles: ['B'] },
      ]),
      tasks,
      WED_FRI,
    );
    expect(v.ok).toBe(false);
    expect(v.violations.join(' ')).toContain('"A" is due thu but placed on fri');
  });

  it('a due date outside the planned week constrains nothing', () => {
    const t = [task({ title: 'far', dueAt: '2026-08-01' })];
    const v = validatePlan(plan([{ day: 'fri', titles: ['far'] }]), t, WED_FRI);
    expect(v.ok).toBe(true);
  });
});
