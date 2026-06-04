import type { TaskWithAssigneesRow } from '@seta/planner';
import { addDaysKey, startOfWeekKey, toDateKey } from './calendar-dates';

export interface TaskSpan {
  task: TaskWithAssigneesRow;
  /** 1-based CSS grid column of the segment's first day (1 = Monday). */
  startCol: number;
  /** Number of columns the segment covers (1–7). */
  span: number;
  /** 0-based vertical track within the week row. */
  lane: number;
  /** Segment continues from the previous week → render a flat left edge. */
  clippedStart: boolean;
  /** Segment continues into the next week → render a flat right edge. */
  clippedEnd: boolean;
}

/**
 * Mon–Sun rows of date keys covering [from..to], padded outwards to full
 * weeks. ISO date keys compare correctly as strings.
 */
export function buildCalendarWeeks(from: string, to: string): string[][] {
  const weeks: string[][] = [];
  let cursor = startOfWeekKey(from);
  while (cursor <= to) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) week.push(addDaysKey(cursor, i));
    weeks.push(week);
    cursor = addDaysKey(cursor, 7);
  }
  return weeks;
}

/**
 * A task's day-resolution range. Single-date tasks collapse to one day —
 * mirroring the backend's coalesce(tstzrange) predicate. Null when undated.
 */
export function taskDayRange(task: {
  start_at: string | null;
  due_at: string | null;
}): { start: string; end: string } | null {
  const startIso = task.start_at ?? task.due_at;
  const endIso = task.due_at ?? task.start_at;
  if (!startIso || !endIso) return null;
  const start = toDateKey(new Date(startIso));
  const end = toDateKey(new Date(endIso));
  return start <= end ? { start, end } : { start: end, end: start };
}

/**
 * Clip tasks to one week row and pack them into collision-free lanes.
 * Greedy first-fit after sorting by (startCol, longer-first, title, id) gives
 * compact, deterministic packing regardless of input order.
 */
export function assignWeekSpans(tasks: TaskWithAssigneesRow[], weekDays: string[]): TaskSpan[] {
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  if (weekStart === undefined || weekEnd === undefined) return [];

  const segments: TaskSpan[] = tasks.flatMap((task) => {
    const range = taskDayRange(task);
    if (!range || range.end < weekStart || range.start > weekEnd) return [];
    const segStart = range.start < weekStart ? weekStart : range.start;
    const segEnd = range.end > weekEnd ? weekEnd : range.end;
    const startCol = weekDays.indexOf(segStart) + 1;
    const endCol = weekDays.indexOf(segEnd) + 1;
    return [
      {
        task,
        startCol,
        span: endCol - startCol + 1,
        lane: 0,
        clippedStart: range.start < weekStart,
        clippedEnd: range.end > weekEnd,
      },
    ];
  });

  segments.sort(
    (a, b) =>
      a.startCol - b.startCol ||
      b.span - a.span ||
      a.task.title.localeCompare(b.task.title) ||
      a.task.id.localeCompare(b.task.id),
  );

  // laneEnds[i] = last occupied column in lane i.
  const laneEnds: number[] = [];
  for (const seg of segments) {
    let lane = laneEnds.findIndex((end) => end < seg.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    seg.lane = lane;
    laneEnds[lane] = seg.startCol + seg.span - 1;
  }
  return segments;
}
