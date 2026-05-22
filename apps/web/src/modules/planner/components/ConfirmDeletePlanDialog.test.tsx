import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDeletePlanDialog } from './ConfirmDeletePlanDialog';

describe('ConfirmDeletePlanDialog', () => {
  it('renders with title "Delete this plan?" when open', () => {
    render(
      <ConfirmDeletePlanDialog
        open
        onOpenChange={() => {}}
        externalSource="native"
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Delete this plan?' })).toBeInTheDocument();
  });

  it('native plan: shows trash body, no checkbox, Delete enabled immediately', () => {
    render(
      <ConfirmDeletePlanDialog
        open
        onOpenChange={() => {}}
        externalSource="native"
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText(/All tasks in it will be moved to Trash/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /I understand this also deletes/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled();
  });

  it('linked plan: shows M365 warning, checkbox visible, Delete disabled until checked', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDeletePlanDialog
        open
        onOpenChange={() => {}}
        externalSource="m365"
        onConfirm={() => {}}
      />,
    );
    expect(
      screen.getByText(/It will also be deleted in Microsoft 365 Planner/i),
    ).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', {
      name: /I understand this also deletes the M365 Planner plan/i,
    });
    expect(checkbox).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    await user.click(checkbox);
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled();
  });

  it('Cancel calls onOpenChange(false) and does NOT call onConfirm', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDeletePlanDialog
        open
        onOpenChange={onOpenChange}
        externalSource="native"
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Delete (when enabled) calls onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDeletePlanDialog
        open
        onOpenChange={() => {}}
        externalSource="native"
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('pending=true disables the Delete button', () => {
    render(
      <ConfirmDeletePlanDialog
        open
        onOpenChange={() => {}}
        externalSource="native"
        onConfirm={() => {}}
        pending
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
