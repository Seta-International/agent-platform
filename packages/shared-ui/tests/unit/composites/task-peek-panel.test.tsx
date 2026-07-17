import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type PeekTask, TaskPeekPanel } from '../../../src/composites/task-peek-panel';

const task: PeekTask = {
  id: 't1',
  title: 'Fix login',
  status: { label: 'In progress', tone: 'primary' },
  priority: { label: 'Urgent', level: 'urgent' },
  assignees: [{ user_id: 'u1', display_name: 'Alice' }],
  due: '2026-07-25T00:00:00.000Z',
  labels: [{ id: 'l1', name: 'bug' }],
  percentComplete: 50,
  plan: 'Q3 Launch',
  bucket: 'In Progress',
};

describe('TaskPeekPanel', () => {
  beforeEach(() => window.localStorage.clear());

  it('renders nothing when task is null', () => {
    render(<TaskPeekPanel task={null} onClose={() => {}} onOpenFull={() => {}} storageKey="k" />);
    expect(screen.queryByTestId('task-peek-panel')).not.toBeInTheDocument();
  });

  it('renders title, status, priority, plan context, and labels', () => {
    render(<TaskPeekPanel task={task} onClose={() => {}} onOpenFull={() => {}} storageKey="k" />);
    expect(screen.getByText('Fix login')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('Q3 Launch · In Progress')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();
  });

  it('fires onOpenFull with the task id', async () => {
    const onOpenFull = vi.fn();
    render(<TaskPeekPanel task={task} onClose={() => {}} onOpenFull={onOpenFull} storageKey="k" />);
    await userEvent.click(screen.getByRole('button', { name: /open full details/i }));
    expect(onOpenFull).toHaveBeenCalledWith('t1');
  });

  it('close button and Escape both call onClose', async () => {
    const onClose = vi.fn();
    render(<TaskPeekPanel task={task} onClose={onClose} onOpenFull={() => {}} storageKey="k" />);
    await userEvent.click(screen.getByRole('button', { name: /close panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('reads its initial width from localStorage (autoSaveId is a no-op upstream)', () => {
    window.localStorage.setItem('k', '420');
    render(<TaskPeekPanel task={task} onClose={() => {}} onOpenFull={() => {}} storageKey="k" />);
    const panel = screen.getByTestId('task-peek-panel');
    expect(panel.getAttribute('style') ?? '').toContain('420');
  });
});
