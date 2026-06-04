import type { TaskWithAssigneesRow } from '@seta/planner';
import { describe, expect, it } from 'vitest';
import {
  assignWeekSpans,
  buildCalendarWeeks,
  taskDayRange,
} from '../../../../../src/modules/planner/lib/calendar-lanes';

// Only the fields the lane math reads.
function task(id: string, start_at: string | null, due_at: string | null): TaskWithAssigneesRow {
  return { id, title: id, start_at, due_at } as TaskWithAssigneesRow;
}

const WEEK = [
  '2026-06-01',
  '2026-06-02',
  '2026-06-03',
  '2026-06-04',
  '2026-06-05',
  '2026-06-06',
  '2026-06-07',
];

describe('buildCalendarWeeks', () => {
  it('pads June 2026 to five full Mon–Sun weeks', () => {
    const weeks = buildCalendarWeeks('2026-06-01', '2026-06-30');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]).toBe('2026-06-01'); // June 2026 starts on a Monday
    expect(weeks[4]![6]).toBe('2026-07-05'); // padded past June 30
  });

  it('pads a mid-week-starting month backwards to Monday', () => {
    const weeks = buildCalendarWeeks('2026-07-01', '2026-07-31'); // July 1 is a Wednesday
    expect(weeks[0]![0]).toBe('2026-06-29');
    expect(weeks[0]![2]).toBe('2026-07-01');
  });

  it('a single week range yields exactly one row', () => {
    expect(buildCalendarWeeks('2026-06-01', '2026-06-07')).toEqual([WEEK]);
  });
});

describe('taskDayRange', () => {
  it('uses both dates, fills missing ones symmetrically, null when undated', () => {
    expect(taskDayRange(task('a', '2026-06-02T08:00:00Z', '2026-06-04T17:00:00Z'))).toEqual({
      start: '2026-06-02',
      end: '2026-06-04',
    });
    expect(taskDayRange(task('b', null, '2026-06-03T00:00:00Z'))).toEqual({
      start: '2026-06-03',
      end: '2026-06-03',
    });
    expect(taskDayRange(task('c', '2026-06-03T00:00:00Z', null))).toEqual({
      start: '2026-06-03',
      end: '2026-06-03',
    });
    expect(taskDayRange(task('d', null, null))).toBeNull();
  });

  it('normalises inverted ranges defensively', () => {
    expect(taskDayRange(task('e', '2026-06-05T00:00:00Z', '2026-06-02T00:00:00Z'))).toEqual({
      start: '2026-06-02',
      end: '2026-06-05',
    });
  });
});

describe('assignWeekSpans', () => {
  it('computes column and span; single-date tasks are 1-column pills', () => {
    const spans = assignWeekSpans(
      [
        task('multi', '2026-06-02T00:00:00Z', '2026-06-04T00:00:00Z'),
        task('single', null, '2026-06-06T00:00:00Z'),
      ],
      WEEK,
    );
    const multi = spans.find((s) => s.task.id === 'multi')!;
    expect(multi).toMatchObject({ startCol: 2, span: 3, clippedStart: false, clippedEnd: false });
    const single = spans.find((s) => s.task.id === 'single')!;
    expect(single).toMatchObject({ startCol: 6, span: 1 });
  });

  it('clips week-crossing tasks and flags the cut edges (AC-4)', () => {
    // May 30 – Jun 9 crosses into and out of this week.
    const [seg] = assignWeekSpans(
      [task('long', '2026-05-30T00:00:00Z', '2026-06-09T00:00:00Z')],
      WEEK,
    );
    expect(seg).toMatchObject({
      startCol: 1,
      span: 7,
      clippedStart: true, // continues from previous week → flat left edge
      clippedEnd: true, // continues into next week → flat right edge
    });
  });

  it('drops tasks that do not touch the week', () => {
    expect(
      assignWeekSpans([task('may', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z')], WEEK),
    ).toEqual([]);
  });

  it('packs overlapping tasks into distinct lanes, non-overlapping share lane 0', () => {
    const spans = assignWeekSpans(
      [
        task('a', '2026-06-01T00:00:00Z', '2026-06-03T00:00:00Z'), // cols 1–3
        task('b', '2026-06-02T00:00:00Z', '2026-06-04T00:00:00Z'), // cols 2–4 — overlaps a
        task('c', '2026-06-05T00:00:00Z', '2026-06-06T00:00:00Z'), // cols 5–6 — fits lane 0 again
      ],
      WEEK,
    );
    const byId = Object.fromEntries(spans.map((s) => [s.task.id, s]));
    expect(byId.a!.lane).toBe(0);
    expect(byId.b!.lane).toBe(1);
    expect(byId.c!.lane).toBe(0);
  });

  it('lane assignment is deterministic regardless of input order', () => {
    const tasks = [
      task('a', '2026-06-01T00:00:00Z', '2026-06-07T00:00:00Z'),
      task('b', '2026-06-01T00:00:00Z', '2026-06-07T00:00:00Z'),
    ];
    const lanesOf = (input: TaskWithAssigneesRow[]) =>
      Object.fromEntries(assignWeekSpans(input, WEEK).map((s) => [s.task.id, s.lane]));
    expect(lanesOf(tasks)).toEqual(lanesOf([...tasks].reverse()));
  });
});
