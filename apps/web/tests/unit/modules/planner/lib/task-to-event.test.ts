import type { TaskWithAssigneesRow } from '@seta/planner';
import { describe, expect, it } from 'vitest';
import { taskToFCEvent } from '../../../../../src/modules/planner/lib/task-to-event';

function task(id: string, start_at: string | null, due_at: string | null): TaskWithAssigneesRow {
  return { id, title: id, start_at, due_at } as TaskWithAssigneesRow;
}

describe('taskToFCEvent', () => {
  it('maps both dates; end is due_at + 1 day (FC all-day end is exclusive)', () => {
    const e = taskToFCEvent(task('t1', '2026-06-02T08:00:00Z', '2026-06-04T17:00:00Z'));
    expect(e.start).toBe('2026-06-02');
    expect(e.end).toBe('2026-06-05');
    expect(e.id).toBe('t1');
    expect(e.allDay).toBe(true);
  });

  it('uses due_at as start when start_at is null', () => {
    const e = taskToFCEvent(task('t2', null, '2026-06-03T00:00:00Z'));
    expect(e.start).toBe('2026-06-03');
    expect(e.end).toBe('2026-06-04');
  });

  it('uses start_at as start when due_at is null, no end set', () => {
    const e = taskToFCEvent(task('t3', '2026-06-03T00:00:00Z', null));
    expect(e.start).toBe('2026-06-03');
    expect(e.end).toBeUndefined();
  });

  it('returns undefined start for tasks with no dates (FC ignores them)', () => {
    const e = taskToFCEvent(task('t4', null, null));
    expect(e.start).toBeUndefined();
    expect(e.end).toBeUndefined();
  });

  it('stores the original task in extendedProps', () => {
    const t = task('t5', '2026-06-01T00:00:00Z', '2026-06-05T00:00:00Z');
    expect(taskToFCEvent(t).extendedProps?.task).toBe(t);
  });
});
