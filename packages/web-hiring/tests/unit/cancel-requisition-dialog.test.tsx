import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloseReason } from '../../src/api/hiring-client.ts';

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
});

describe('CancelRequisitionDialog', () => {
  it('auto-selects the first active reason and cancels with it', async () => {
    reasons = [{ id: 'cr1', label: 'No longer needed', active: true, version: 1 }];
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

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /reason/i })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel requisition' }));
    await waitFor(() =>
      expect(closeRequisition).toHaveBeenCalledWith('req1', {
        expected_version: 1,
        status: 'cancelled',
        close_reason_id: 'cr1',
      }),
    );
    // onDone is deferred ~250ms past the dialog's exit animation (see cancel-requisition-dialog.tsx).
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('offers an inline "Add reason" form when no close reasons exist yet', async () => {
    reasons = [];
    createCloseReason.mockResolvedValueOnce({ id: 'cr-new' });
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

    await expect(
      screen.findByText('No close reasons yet — add one to continue.'),
    ).resolves.toBeInTheDocument();
    // Cancel is disabled until a reason exists.
    expect(screen.getByRole('button', { name: 'Cancel requisition' })).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText('e.g. Position no longer needed'),
      'Budget freeze',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add reason' }));
    await waitFor(() => expect(createCloseReason).toHaveBeenCalledWith({ label: 'Budget freeze' }));
  });
});
