import type { GroupActivityItem } from '@seta/planner';
import { describe, expect, it } from 'vitest';
import { buildActivityLabel } from '../../../../../src/modules/planner/lib/build-activity-label';

function item(partial: Partial<GroupActivityItem>): GroupActivityItem {
  return {
    event_id: 'e',
    event_type: 'planner.task.updated',
    verb: 'updated task',
    target_title: 'Task X',
    occurred_at: '2026-06-12T00:00:00Z',
    actor_user_id: 'u',
    actor_display_name: 'Ana',
    target_user_id: null,
    target_user_display_name: null,
    before_state: null,
    after_state: null,
    changed_fields: null,
    ...partial,
  };
}

describe('buildActivityLabel', () => {
  it('renders a column move with from/to bucket names', () => {
    expect(
      buildActivityLabel(
        item({
          event_type: 'planner.task.moved',
          before_state: { bucket_id: 'b1', bucket_name: 'To Do' },
          after_state: { bucket_id: 'b2', bucket_name: 'In Progress' },
        }),
      ),
    ).toBe('Ana moved "Task X" from To Do to In Progress');
  });

  it('renders a cross-plan move with plan name', () => {
    expect(
      buildActivityLabel(
        item({
          event_type: 'planner.task.moved',
          before_state: { plan_id: 'p1', plan_name: 'Backlog' },
          after_state: { plan_id: 'p2', plan_name: 'Q3 Launch' },
        }),
      ),
    ).toBe('Ana moved "Task X" to plan Q3 Launch');
  });

  it('falls back to generic move when names are unresolved', () => {
    expect(
      buildActivityLabel(
        item({
          event_type: 'planner.task.moved',
          before_state: { bucket_id: 'b1', bucket_name: null },
          after_state: { bucket_id: 'b2', bucket_name: null },
        }),
      ),
    ).toBe('Ana moved "Task X"');
  });

  it('sets a due date', () => {
    expect(
      buildActivityLabel(
        item({
          changed_fields: ['due_at'],
          before_state: { due_at: null },
          after_state: { due_at: '2026-06-20T00:00:00Z' },
        }),
      ),
    ).toBe('Ana set the due date on "Task X" to Jun 20, 2026');
  });

  it('changes a due date', () => {
    expect(
      buildActivityLabel(
        item({
          changed_fields: ['due_at'],
          before_state: { due_at: '2026-06-18T00:00:00Z' },
          after_state: { due_at: '2026-06-20T00:00:00Z' },
        }),
      ),
    ).toBe('Ana changed the due date on "Task X" from Jun 18, 2026 to Jun 20, 2026');
  });

  it('clears a due date', () => {
    expect(
      buildActivityLabel(
        item({
          changed_fields: ['due_at'],
          before_state: { due_at: '2026-06-18T00:00:00Z' },
          after_state: { due_at: null },
        }),
      ),
    ).toBe('Ana cleared the due date on "Task X"');
  });

  it('changes priority by name', () => {
    expect(
      buildActivityLabel(
        item({
          changed_fields: ['priority_number'],
          before_state: { priority_number: 5 },
          after_state: { priority_number: 1 },
        }),
      ),
    ).toBe('Ana changed priority on "Task X" to Urgent');
  });

  it('sets progress', () => {
    expect(
      buildActivityLabel(
        item({
          changed_fields: ['percent_complete'],
          before_state: { percent_complete: 0 },
          after_state: { percent_complete: 50 },
        }),
      ),
    ).toBe('Ana set progress on "Task X" to 50%');
  });

  it('humanizes multi-field updates', () => {
    expect(
      buildActivityLabel(
        item({
          changed_fields: ['due_at', 'priority_number'],
          before_state: {},
          after_state: {},
        }),
      ),
    ).toBe('Ana updated due date, priority on "Task X"');
  });

  it('keeps the rename phrasing', () => {
    expect(
      buildActivityLabel(
        item({
          changed_fields: ['title'],
          before_state: { title: 'Old' },
          after_state: { title: 'New' },
        }),
      ),
    ).toBe('Ana renamed "Old" to "New"');
  });
});
