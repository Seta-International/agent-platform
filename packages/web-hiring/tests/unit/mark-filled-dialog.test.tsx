import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const closeRequisition = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  closeRequisition: (id: string, input: unknown) => closeRequisition(id, input),
}));

import { MarkFilledDialog } from '../../src/pages/mark-filled-dialog.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

function renderDialog(props: Partial<Parameters<typeof MarkFilledDialog>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const onDone = vi.fn();
  const view = render(
    <MarkFilledDialog
      requisitionId="req1"
      version={1}
      open
      onOpenChange={onOpenChange}
      onDone={onDone}
      {...props}
    />,
    { wrapper: wrap(qc) },
  );
  return { ...view, onOpenChange, onDone };
}

// Astryx's AlertDialog always mounts its <dialog> element regardless of `isOpen`, so "closed" is
// asserted via the alertdialog role leaving the accessibility tree, never via content unmounting.
describe('MarkFilledDialog', () => {
  it('is not exposed as an alertdialog while closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the confirmation copy when open', () => {
    renderDialog();
    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Mark requisition as completed?' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "This closes the requisition for good — it can't be reopened or moved back to a stage afterwards.",
      ),
    ).toBeInTheDocument();
  });

  it('closes via Back without calling closeRequisition', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Back' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(closeRequisition).not.toHaveBeenCalled();
  });

  // Escape dismisses (Astryx AlertDialog hardcodes purpose="form" → allowEscape; the pre-Astryx
  // primitive preventDefault'd Escape instead). Pinned deliberately: Astryx exposes no override,
  // and cancelling is always non-destructive here — the requisition only closes via the action.
  it('closes on Escape without calling closeRequisition', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Back' }).focus();
    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(closeRequisition).not.toHaveBeenCalled();
  });

  it('confirms by calling closeRequisition with status filled and no reason', async () => {
    closeRequisition.mockResolvedValueOnce({ version: 2 });
    const { onDone, onOpenChange } = renderDialog();

    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark completed' }));

    await waitFor(() =>
      expect(closeRequisition).toHaveBeenCalledWith('req1', {
        expected_version: 1,
        status: 'filled',
      }),
    );
    // onSuccess closes the dialog and hands off directly — the old setTimeout(onDone, 250) is
    // gone. Astryx's Dialog does take a body scroll lock (useScrollLock), but releases it from an
    // unconditional effect cleanup that runs on unmount, so unmounting mid-close can't strand it
    // the way Radix's portal teardown could. onDone must fire once, with no deferred call left.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('disables the action and relabels it while the mutation is pending', async () => {
    closeRequisition.mockReturnValueOnce(new Promise(() => {}));
    renderDialog();

    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark completed' }));

    const action = await within(dialog).findByRole('button', { name: 'Marking…' });
    expect(action).toBeDisabled();
  });
});
