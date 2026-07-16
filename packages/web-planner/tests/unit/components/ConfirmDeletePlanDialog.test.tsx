import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDeletePlanDialog } from '../../../src/components/ConfirmDeletePlanDialog';

describe('ConfirmDeletePlanDialog', () => {
  // purpose="required" (mandatory destructive confirm) makes Astryx's Dialog render
  // role="alertdialog", not "dialog" — verified against @astryxdesign/core Dialog.tsx
  // (`role={purpose === 'required' ? 'alertdialog' : undefined}`) and empirically here.
  // Astryx's Dialog/DialogHeader do not wire aria-labelledby, so the alertdialog has no
  // computed accessible name — assert the title via its heading instead of `{ name }`.
  it('exposes an accessible alertdialog with heading "Delete this plan?" when open', () => {
    render(
      <ConfirmDeletePlanDialog
        open
        onOpenChange={() => {}}
        externalSource="native"
        onConfirm={() => {}}
      />,
    );
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Delete this plan?' })).toBeInTheDocument();
  });

  it('is not exposed as an alertdialog when closed', () => {
    render(
      <ConfirmDeletePlanDialog
        open={false}
        onOpenChange={() => {}}
        externalSource="native"
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
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
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Its tasks move to Trash/i)).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('checkbox', { name: /I understand this also deletes/i }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).not.toBeDisabled();
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
    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByText(/This also deletes the matching plan in Microsoft Planner/i),
    ).toBeInTheDocument();
    const checkbox = within(dialog).getByRole('checkbox', {
      name: /I understand this also deletes the matching Microsoft Planner plan/i,
    });
    expect(checkbox).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled();

    await user.click(checkbox);
    expect(within(dialog).getByRole('button', { name: 'Delete' })).not.toBeDisabled();
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
