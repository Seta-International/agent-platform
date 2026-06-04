import type { TaskWithAssigneesRow } from '@seta/planner';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskSpanBar } from '../../../../../../src/modules/planner/components/calendar/task-span-bar';
import type { TaskSpan } from '../../../../../../src/modules/planner/lib/calendar-lanes';

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

function makeSpan(overrides: Partial<TaskSpan> = {}): TaskSpan {
  return {
    task: makeTask(),
    startCol: 2,
    span: 3,
    lane: 1,
    clippedStart: false,
    clippedEnd: false,
    ...overrides,
  };
}

describe('TaskSpanBar', () => {
  it('positions itself by grid column/row and opens the task on click', async () => {
    const onOpenTask = vi.fn();
    render(<TaskSpanBar span={makeSpan()} onOpenTask={onOpenTask} />);
    const bar = screen.getByTestId('task-span-t1');
    expect(bar.style.gridColumn).toBe('2 / span 3');
    expect(bar.style.gridRow).toBe('2'); // lane 1 → row 2
    await userEvent.click(bar);
    expect(onOpenTask).toHaveBeenCalledWith('t1');
  });

  it('shows the due label only on the terminal segment (spec: week-crossing)', () => {
    const { rerender } = render(
      <TaskSpanBar span={makeSpan({ clippedEnd: true })} onOpenTask={() => {}} />,
    );
    expect(screen.queryByTestId('task-span-due')).not.toBeInTheDocument();
    rerender(<TaskSpanBar span={makeSpan({ clippedEnd: false })} onOpenTask={() => {}} />);
    expect(screen.getByTestId('task-span-due')).toBeInTheDocument();
  });

  it('caps avatars at 3 with overflow indicator', () => {
    render(<TaskSpanBar span={makeSpan()} onOpenTask={() => {}} />);
    expect(screen.getByText('+1')).toBeInTheDocument(); // AvatarStack overflow for 4 assignees
  });

  it('shows the M365 badge and conflict warning when applicable', () => {
    render(
      <TaskSpanBar
        span={makeSpan({ task: makeTask({ external_source: 'm365', sync_status: 'conflict' }) })}
        onOpenTask={() => {}}
      />,
    );
    expect(screen.getByText('M365')).toBeInTheDocument();
    expect(screen.getByLabelText('Sync conflict')).toBeInTheDocument();
  });

  it('uses the priority palette for the stripe', () => {
    render(<TaskSpanBar span={makeSpan()} onOpenTask={() => {}} />); // priority_number 1 = urgent
    expect(screen.getByTestId('task-span-t1').style.borderLeftColor).toBe(
      'var(--color-priority-urgent)',
    );
  });
});
