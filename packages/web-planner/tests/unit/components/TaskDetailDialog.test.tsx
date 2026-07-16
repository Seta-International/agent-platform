import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDetailDialog } from '../../../src/components/TaskDetailDialog';

// `TaskDetailDialog` is a thin shell around `TaskDetailPage` (which owns its own data-fetching,
// header, and delete/duplicate/move dialogs via many hooks). Mock it so this file tests only the
// shell's own responsibilities: the Astryx `Dialog` wiring, the `aria-label` special case (no
// visible `DialogHeader`/footer — see the component's own doc comment), and the close/expand
// buttons passed through `modalHeaderActions`.
const taskDetailPageMock = vi.fn();
vi.mock('../../../src/pages/task-detail-page', () => ({
  TaskDetailPage: (props: {
    planId: string;
    taskId: string;
    variant?: string;
    modalHeaderActions?: ReactNode;
    onDeleted?: () => void;
  }) => {
    taskDetailPageMock(props);
    return <div data-testid="task-detail-page-stub">{props.modalHeaderActions}</div>;
  },
}));

beforeEach(() => {
  taskDetailPageMock.mockClear();
});

function renderDialog(overrides: Partial<React.ComponentProps<typeof TaskDetailDialog>> = {}) {
  const onClose = vi.fn();
  const onOpenFullPage = vi.fn();
  render(
    <TaskDetailDialog
      planId="p1"
      taskId="t1"
      onClose={onClose}
      onOpenFullPage={onOpenFullPage}
      {...overrides}
    />,
  );
  return { onClose, onOpenFullPage };
}

describe('TaskDetailDialog', () => {
  // No `DialogHeader` is rendered here (special case — `TaskDetailPage` renders its own visible
  // header), so the dialog's accessible name comes directly from `aria-label="Task"` rather than
  // a heading. purpose="info" keeps role="dialog" (only purpose="required" maps to alertdialog).
  it('renders as an accessible dialog labeled "Task" when mounted', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Task' })).toBeInTheDocument();
  });

  it('passes planId, taskId, variant="modal", onDeleted, and modalHeaderActions to TaskDetailPage', () => {
    const { onClose } = renderDialog({ planId: 'p-42', taskId: 't-99' });
    expect(taskDetailPageMock).toHaveBeenCalledTimes(1);
    expect(taskDetailPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'p-42',
        taskId: 't-99',
        variant: 'modal',
        onDeleted: onClose,
        modalHeaderActions: expect.anything(),
      }),
    );
  });

  it('clicking the close button (rendered via modalHeaderActions) calls onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the expand button calls onOpenFullPage', async () => {
    const user = userEvent.setup();
    const { onOpenFullPage } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Open as full page' }));
    expect(onOpenFullPage).toHaveBeenCalledTimes(1);
  });
});
