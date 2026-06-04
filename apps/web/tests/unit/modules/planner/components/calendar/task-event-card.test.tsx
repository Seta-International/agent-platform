import type { TaskWithAssigneesRow } from '@seta/planner';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskEventCard } from '../../../../../../src/modules/planner/components/calendar/task-event-card';

function makeTask(overrides: Partial<TaskWithAssigneesRow> = {}): TaskWithAssigneesRow {
  return {
    id: 't1',
    title: 'Ship calendar',
    priority_number: 1,
    due_at: '2026-06-10T00:00:00Z',
    start_at: null,
    assignees: [
      { user_id: 'u1', display_name: 'Alice A' },
      { user_id: 'u2', display_name: 'Bob B' },
      { user_id: 'u3', display_name: 'Cara C' },
      { user_id: 'u4', display_name: 'Dan D' },
    ],
    external_source: 'native',
    sync_status: 'idle',
    ...overrides,
  } as TaskWithAssigneesRow;
}

describe('TaskEventCard', () => {
  it('renders the task title with the correct test id', () => {
    render(<TaskEventCard task={makeTask()} />);
    expect(screen.getByTestId('task-event-t1')).toBeInTheDocument();
    expect(screen.getByText('Ship calendar')).toBeInTheDocument();
  });

  it('applies the priority colour to the left border stripe', () => {
    render(<TaskEventCard task={makeTask({ priority_number: 1 })} />);
    expect(screen.getByTestId('task-event-t1').style.borderLeftColor).toBe(
      'var(--color-priority-urgent)',
    );
  });

  it('shows the due date label when task has due_at', () => {
    render(<TaskEventCard task={makeTask()} />);
    expect(screen.getByTestId('task-event-due')).toBeInTheDocument();
  });

  it('hides the due date label when task has no due_at', () => {
    render(<TaskEventCard task={makeTask({ due_at: null })} />);
    expect(screen.queryByTestId('task-event-due')).not.toBeInTheDocument();
  });

  it('caps avatars at 3 with an overflow indicator for 4 assignees', () => {
    render(<TaskEventCard task={makeTask()} />);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('shows the M365 badge and conflict warning when applicable', () => {
    render(<TaskEventCard task={makeTask({ external_source: 'm365', sync_status: 'conflict' })} />);
    expect(screen.getByText('M365')).toBeInTheDocument();
    expect(screen.getByLabelText('Sync conflict')).toBeInTheDocument();
  });
});
