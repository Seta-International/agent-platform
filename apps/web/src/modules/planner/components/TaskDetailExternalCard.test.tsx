import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { TaskDetailExternalCard } from './TaskDetailExternalCard';

describe('TaskDetailExternalCard', () => {
  it('shows native source summary when plan is native', () => {
    const task = makeTaskWithAssignees({ id: 't1', external_source: 'native' });
    render(
      <TaskDetailExternalCard
        task={task}
        plan={{ external_source: 'native', external_id: null, name: 'Native Plan' }}
      />,
    );
    expect(screen.getByText(/Source:/)).toBeInTheDocument();
    expect(screen.getByText(/Native/)).toBeInTheDocument();
    expect(screen.getByText(/Synced:/)).toBeInTheDocument();
    expect(screen.getByText(/never/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resolve conflicts/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open in M365 Planner/i })).not.toBeInTheDocument();
  });

  it('shows "Source: M365 · {planName}" when plan is m365-linked', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      external_source: 'm365',
      external_id: 'ext-task-1',
      external_synced_at: null,
    });
    render(
      <TaskDetailExternalCard
        task={task}
        plan={{
          external_source: 'm365',
          external_id: 'ext-plan-1',
          name: 'Launch Q3',
        }}
      />,
    );
    const sourceLine = screen.getByText(/Source:/).closest('div');
    expect(sourceLine?.textContent ?? '').toMatch(/M365.*Launch Q3/);
  });

  it('shows a relative-time string when external_synced_at is set', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      external_source: 'm365',
      external_id: 'ext-task-1',
      external_synced_at: new Date(Date.now() - 60_000).toISOString(),
    });
    render(
      <TaskDetailExternalCard
        task={task}
        plan={{ external_source: 'm365', external_id: 'ext-plan-1', name: 'Launch' }}
      />,
    );
    // formatRelative renders something like "1 minute ago" or "just now"
    const syncedLine = screen.getByText(/Synced:/).closest('div');
    expect(syncedLine?.textContent ?? '').not.toMatch(/never/);
  });

  it('shows "never" when external_synced_at is null', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      external_source: 'm365',
      external_id: 'ext-task-1',
      external_synced_at: null,
    });
    render(
      <TaskDetailExternalCard
        task={task}
        plan={{ external_source: 'm365', external_id: 'ext-plan-1', name: 'Launch' }}
      />,
    );
    expect(screen.getByText(/never/)).toBeInTheDocument();
  });

  it('humanizes a known planner-limit code on error', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      external_source: 'm365',
      external_id: 'ext-task-1',
      sync_status: 'error',
      last_error: 'MaximumTasksInProject',
    });
    render(
      <TaskDetailExternalCard
        task={task}
        plan={{ external_source: 'm365', external_id: 'ext-plan-1', name: 'Launch' }}
      />,
    );
    expect(screen.getByText('This M365 Planner plan is at its task limit.')).toBeInTheDocument();
  });

  it('shows the raw last_error string when it is not a known code', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      external_source: 'm365',
      external_id: 'ext-task-1',
      sync_status: 'error',
      last_error: 'Network timeout during pull',
    });
    render(
      <TaskDetailExternalCard
        task={task}
        plan={{ external_source: 'm365', external_id: 'ext-plan-1', name: 'Launch' }}
      />,
    );
    expect(screen.getByText('Network timeout during pull')).toBeInTheDocument();
  });

  it('shows "Resolve conflicts" button when sync_status is conflict and invokes callback', async () => {
    const user = userEvent.setup();
    const onOpenConflictDialog = vi.fn();
    const task = makeTaskWithAssignees({
      id: 't1',
      external_source: 'm365',
      external_id: 'ext-task-1',
      sync_status: 'conflict',
    });
    render(
      <TaskDetailExternalCard
        task={task}
        plan={{ external_source: 'm365', external_id: 'ext-plan-1', name: 'Launch' }}
        onOpenConflictDialog={onOpenConflictDialog}
      />,
    );
    const btn = screen.getByRole('button', { name: /Resolve conflicts/i });
    await user.click(btn);
    expect(onOpenConflictDialog).toHaveBeenCalledTimes(1);
  });

  it('shows an "Open in M365 Planner" anchor with the correct href and rel/target', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      external_source: 'm365',
      external_id: 'ext-task-1',
    });
    render(
      <TaskDetailExternalCard
        task={task}
        plan={{ external_source: 'm365', external_id: 'ext-plan-1', name: 'Launch' }}
      />,
    );
    const link = screen.getByRole('link', { name: /Open in M365 Planner/i });
    expect(link).toHaveAttribute(
      'href',
      'https://tasks.office.com/Home/Planner/#/plantaskboard?planId=ext-plan-1',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('falls back to inferring source from the task when plan prop is omitted', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      external_source: 'm365',
      external_id: 'ext-task-1',
    });
    render(<TaskDetailExternalCard task={task} />);
    const sourceLine = screen.getByText(/Source:/).closest('div');
    expect(sourceLine?.textContent ?? '').toMatch(/M365/);
  });
});
