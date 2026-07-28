import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloseReason } from '../../src/api/hiring-client.ts';
import { hiringKeys } from '../../src/state/query-keys.ts';

let reasons: CloseReason[] = [];
const closeRequisition = vi.fn();
const createCloseReason = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  closeRequisition: (id: string, input: unknown) => closeRequisition(id, input),
  createCloseReason: (input: unknown) => createCloseReason(input),
  fetchCloseReasons: () => Promise.resolve(reasons),
}));

import { CancelRequisitionDialog } from '../../src/pages/cancel-requisition-dialog.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  reasons = [];
  closeRequisition.mockReset();
  createCloseReason.mockReset();
});

describe('CancelRequisitionDialog', () => {
  // purpose="required" (cancelling is irreversible) makes Astryx's Dialog render
  // role="alertdialog"; DialogHeader doesn't wire aria-labelledby, so scope with within().
  // FUT: the reason is a single required free-text field (same idiom as reject) — the backend
  // still keys the cancel to a close_reason entity, so the typed text is resolved to an id.
  it('creates a close reason from the typed text, then cancels with it', async () => {
    createCloseReason.mockResolvedValueOnce({ id: 'cr-new' });
    closeRequisition.mockResolvedValueOnce({ version: 2 });
    const onDone = vi.fn();
    render(
      <CancelRequisitionDialog
        requisitionId="req1"
        version={1}
        open
        onOpenChange={() => {}}
        onDone={onDone}
      />,
      { wrapper: wrap(newClient()) },
    );
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Cancel requisition' })).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/reason/i), 'Budget freeze');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(createCloseReason).toHaveBeenCalledWith({ label: 'Budget freeze' }));
    await waitFor(() =>
      expect(closeRequisition).toHaveBeenCalledWith('req1', {
        expected_version: 1,
        status: 'cancelled',
        close_reason_id: 'cr-new',
      }),
    );
    // onDone is deferred ~250ms past the dialog's exit animation (see cancel-requisition-dialog.tsx).
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('reuses a matching active reason instead of minting a duplicate', async () => {
    reasons = [{ id: 'cr1', label: 'No longer needed', active: true, version: 1 }];
    closeRequisition.mockResolvedValueOnce({ version: 2 });
    const qc = newClient();
    render(
      <CancelRequisitionDialog
        requisitionId="req1"
        version={1}
        open
        onOpenChange={() => {}}
        onDone={vi.fn()}
      />,
      { wrapper: wrap(qc) },
    );
    // Wait for the reasons query so the match runs against loaded data (case-insensitive).
    await waitFor(() => expect(qc.getQueryData(hiringKeys.closeReasons())).toBeDefined());
    const dialog = screen.getByRole('alertdialog');

    await userEvent.type(within(dialog).getByLabelText(/reason/i), 'no longer needed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(closeRequisition).toHaveBeenCalledWith('req1', {
        expected_version: 1,
        status: 'cancelled',
        close_reason_id: 'cr1',
      }),
    );
    expect(createCloseReason).not.toHaveBeenCalled();
  });

  // FUT-770: Offer is a late, sensitive stage. When the requisition still has candidates in
  // Offer, the dialog must warn that cancelling closes their active offers — not just that the
  // requisition can't be reopened.
  it('warns that candidates in Offer will be cancelled, with a count', () => {
    render(
      <CancelRequisitionDialog
        requisitionId="req1"
        version={1}
        offerCount={2}
        open
        onOpenChange={() => {}}
        onDone={vi.fn()}
      />,
      { wrapper: wrap(newClient()) },
    );
    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByText(/2 candidates in Offer will be cancelled/i),
    ).toBeInTheDocument();
  });

  it('uses the singular for a single candidate in Offer', () => {
    render(
      <CancelRequisitionDialog
        requisitionId="req1"
        version={1}
        offerCount={1}
        open
        onOpenChange={() => {}}
        onDone={vi.fn()}
      />,
      { wrapper: wrap(newClient()) },
    );
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/1 candidate in Offer will be cancelled/i)).toBeInTheDocument();
  });

  it('shows no Offer warning when nobody is in Offer', () => {
    render(
      <CancelRequisitionDialog
        requisitionId="req1"
        version={1}
        offerCount={0}
        open
        onOpenChange={() => {}}
        onDone={vi.fn()}
      />,
      { wrapper: wrap(newClient()) },
    );
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).queryByText(/in Offer will be cancelled/i)).not.toBeInTheDocument();
  });

  it('keeps Cancel disabled until a reason is typed', async () => {
    render(
      <CancelRequisitionDialog
        requisitionId="req1"
        version={1}
        open
        onOpenChange={() => {}}
        onDone={vi.fn()}
      />,
      { wrapper: wrap(newClient()) },
    );
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/reason/i), 'x');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('is not exposed as an alertdialog when closed', () => {
    render(
      <CancelRequisitionDialog
        requisitionId="req1"
        version={1}
        open={false}
        onOpenChange={() => {}}
        onDone={vi.fn()}
      />,
      { wrapper: wrap(newClient()) },
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
