import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PlanConflictDecision, PlanConflictsPayload } from './resolve-plan-conflicts-dialog';
import { ResolvePlanConflictsDialog } from './resolve-plan-conflicts-dialog';

const planLevelConflicts = [{ field: 'name', local: 'Seta Plan', remote: 'M365 Plan' }];

const taskConflicts = [
  {
    taskId: 'task-1',
    taskTitle: 'Task One',
    taskUrl: 'https://tasks.example.com/task-1',
    fields: [
      { field: 'title', local: 'Seta Title', remote: 'M365 Title' },
      { field: 'due_at', local: '2024-01-01', remote: '2024-02-01' },
    ],
  },
  {
    taskId: 'task-2',
    taskTitle: 'Task Two',
    taskUrl: 'https://tasks.example.com/task-2',
    fields: [
      { field: 'priority', local: 'high', remote: 'medium' },
      { field: 'status', local: 'active', remote: 'completed' },
    ],
  },
];

const baseData: PlanConflictsPayload = {
  planId: 'plan-1',
  planLevelConflicts,
  taskConflicts,
};

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  data: baseData,
  onApply: vi.fn().mockResolvedValue(undefined),
};

function renderDialog(overrides: Partial<typeof baseProps> = {}) {
  return render(<ResolvePlanConflictsDialog {...baseProps} {...overrides} />);
}

describe('ResolvePlanConflictsDialog', () => {
  it('renders title "Resolve sync conflicts" when open=true', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Resolve sync conflicts')).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders description with correct totalFields and taskCount', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    // 1 plan-level + 2+2 task = 5 total; 2 tasks
    expect(within(dialog).getByText(/5 fields across 2 task\(s\)/)).toBeInTheDocument();
  });

  it('renders both TaskConflictGroup entries', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Task One')).toBeInTheDocument();
    expect(within(dialog).getByText('Task Two')).toBeInTheDocument();
  });

  it('first task group has defaultOpen=true — field rows are in the DOM', () => {
    renderDialog();
    // Task One is first — its fields should be visible
    expect(screen.getByTestId('conflict-row-title')).toBeInTheDocument();
    expect(screen.getByTestId('conflict-row-due_at')).toBeInTheDocument();
  });

  it('second task group is closed initially — its field rows are NOT in the DOM', () => {
    renderDialog();
    // Task Two fields (priority, status) should not be visible
    expect(screen.queryByTestId('conflict-row-priority')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conflict-row-status')).not.toBeInTheDocument();
  });

  it('Apply button is disabled when no decisions have been made', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('Apply button is enabled only when all conflicts have a decision', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = screen.getByRole('dialog');

    // Use Seta for all — should enable Apply
    await user.click(within(dialog).getByRole('button', { name: /use seta for all/i }));
    expect(within(dialog).getByRole('button', { name: /apply/i })).not.toBeDisabled();
  });

  it('bulk "Use Seta for all" sets every conflict choice to local', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onApply });
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: /use seta for all/i }));
    await user.click(within(dialog).getByRole('button', { name: /apply/i }));

    expect(onApply).toHaveBeenCalledOnce();
    const decisions: PlanConflictDecision[] = onApply.mock.calls[0]![0] as PlanConflictDecision[];
    expect(decisions).toHaveLength(5); // 1 plan + 2+2 task fields
    expect(decisions.every((d) => d.choice === 'local')).toBe(true);
  });

  it('bulk "Use M365 for all" sets every conflict choice to remote', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onApply });
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: /use m365 for all/i }));
    await user.click(within(dialog).getByRole('button', { name: /apply/i }));

    expect(onApply).toHaveBeenCalledOnce();
    const decisions: PlanConflictDecision[] = onApply.mock.calls[0]![0] as PlanConflictDecision[];
    expect(decisions).toHaveLength(5);
    expect(decisions.every((d) => d.choice === 'remote')).toBe(true);
  });

  it('decisions array has correct shape (kind, field, taskId) after bulk choose', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onApply });
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: /use seta for all/i }));
    await user.click(within(dialog).getByRole('button', { name: /apply/i }));

    const decisions: PlanConflictDecision[] = onApply.mock.calls[0]![0] as PlanConflictDecision[];
    const planDecision = decisions.find((d) => d.kind === 'plan' && d.field === 'name');
    expect(planDecision).toBeDefined();
    expect(planDecision!.choice).toBe('local');

    const taskDecision = decisions.find(
      (d) => d.kind === 'task' && d.taskId === 'task-1' && d.field === 'title',
    );
    expect(taskDecision).toBeDefined();
    expect(taskDecision!.choice).toBe('local');
  });

  it('Apply is disabled while onApply promise is in flight', async () => {
    const user = userEvent.setup();
    let resolveApply!: () => void;
    const onApply = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveApply = res;
        }),
    );
    renderDialog({ onApply });
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: /use seta for all/i }));
    await user.click(within(dialog).getByRole('button', { name: /apply/i }));

    // Still in-flight — button should be disabled
    expect(within(dialog).getByRole('button', { name: /apply/i })).toBeDisabled();
    resolveApply();
  });

  it('dialog closes after Apply succeeds', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onOpenChange, onApply });
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: /use seta for all/i }));
    await user.click(within(dialog).getByRole('button', { name: /apply/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('plan-level section renders when planLevelConflicts is non-empty', () => {
    renderDialog();
    expect(screen.getByText('Plan-level fields')).toBeInTheDocument();
  });

  it('plan-level section is absent when planLevelConflicts is empty', () => {
    renderDialog({ data: { ...baseData, planLevelConflicts: [] } });
    expect(screen.queryByText('Plan-level fields')).not.toBeInTheDocument();
  });

  it('status line shows correct unresolved and chosen counts', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = screen.getByRole('dialog');

    // Initially: 5 unresolved, 0 chosen
    expect(within(dialog).getByText(/5 unresolved/)).toBeInTheDocument();
    expect(within(dialog).getByText(/0 chosen/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /use seta for all/i }));

    // After bulk choose: 0 unresolved, 5 chosen
    expect(within(dialog).getByText(/0 unresolved/)).toBeInTheDocument();
    expect(within(dialog).getByText(/5 chosen/)).toBeInTheDocument();
  });

  it('Cancel button closes the dialog without calling onApply', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onApply = vi.fn();
    renderDialog({ onOpenChange, onApply });
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onApply).not.toHaveBeenCalled();
  });
});
