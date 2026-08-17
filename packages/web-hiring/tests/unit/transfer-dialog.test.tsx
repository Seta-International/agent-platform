import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transferApplication = vi.fn();
const fetchRequisitions = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  transferApplication: (id: string, input: unknown) => transferApplication(id, input),
  fetchRequisitions: () => fetchRequisitions(),
}));

import { TransferDialog } from '../../src/pages/transfer-dialog.tsx';

beforeEach(() => {
  transferApplication.mockReset();
  // Real rows always carry openings_open; both defaults have remaining headcount so they stay
  // selectable transfer targets (the openings_open > 0 guard only excludes filled ones).
  fetchRequisitions.mockReset().mockResolvedValue([
    { id: 'r1', title: 'Backend Eng', status: 'open', openings_open: 2 },
    { id: 'r2', title: 'Frontend Eng', status: 'open', openings_open: 1 },
  ]);
});

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('TransferDialog', () => {
  // purpose="form" (transferring a candidate is a reversible workflow action, not a destructive
  // terminal one) makes Astryx's Dialog render plain role="dialog" — verified precedent from the
  // web-planner batch. Astryx's Dialog/DialogHeader don't wire aria-labelledby, so scope with
  // within() and query the heading for the title instead of `{ name }`.
  it('excludes the current role and transfers to the chosen target', async () => {
    transferApplication.mockResolvedValueOnce({ to_application_id: 'a2', version: 1 });
    const onDone = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <TransferDialog
        applicationId="a1"
        version={3}
        currentRequisitionId="r1"
        open
        onOpenChange={() => {}}
        onDone={onDone}
      />,
      { wrapper: wrap(qc) },
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Change role' })).toBeInTheDocument();
    // Wait for query to load so effectiveTarget resolves to r2 (excludes current r1)
    await waitFor(() =>
      expect(qc.getQueryState(['hiring', 'requisitions', 'options'])?.status).toBe('success'),
    );
    // The trigger shows the selected value (Frontend Eng = r2, since r1 is excluded)
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: /target role/i })).toBeInTheDocument(),
    );
    // effectiveTarget = r2 (Frontend Eng) because r1 is filtered out as currentRequisitionId
    // Clicking submit verifies r2 is selected
    await userEvent.click(within(dialog).getByRole('button', { name: /move candidate/i }));
    await waitFor(() =>
      expect(transferApplication).toHaveBeenCalledWith('a1', {
        expected_version: 3,
        target_requisition_id: 'r2',
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  // FUT-765: a requisition whose headcount is filled keeps status 'open', so the status check
  // alone still lists it. It must be excluded as a transfer target — the candidate could never
  // be hired into it. Here the filled r2 is listed before the open r3; the default target must
  // skip r2 and land on r3.
  it('excludes a headcount-filled requisition from the transfer targets', async () => {
    fetchRequisitions.mockResolvedValueOnce([
      { id: 'r1', title: 'Current Role', status: 'open', openings_open: 2 },
      { id: 'r2', title: 'Filled Role', status: 'open', openings_open: 0 },
      { id: 'r3', title: 'Open Role', status: 'open', openings_open: 1 },
    ]);
    transferApplication.mockResolvedValueOnce({ to_application_id: 'a2', version: 1 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <TransferDialog
        applicationId="a1"
        version={3}
        currentRequisitionId="r1"
        open
        onOpenChange={() => {}}
        onDone={vi.fn()}
      />,
      { wrapper: wrap(qc) },
    );
    const dialog = screen.getByRole('dialog');
    await waitFor(() =>
      expect(qc.getQueryState(['hiring', 'requisitions', 'options'])?.status).toBe('success'),
    );
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: /target role/i })).toBeInTheDocument(),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /move candidate/i }));
    // Default target is the first *selectable* row: r2 is filled, so it must be r3, not r2.
    await waitFor(() =>
      expect(transferApplication).toHaveBeenCalledWith('a1', {
        expected_version: 3,
        target_requisition_id: 'r3',
      }),
    );
  });

  it('does not crash when the requisitions-board query already cached an object under the shared key (FUT-335)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['hiring', 'requisitions'], {
      scope: 'all',
      scoped_account_names: [],
      scoped_project_names: [],
      requisitions: [],
    });
    render(
      <TransferDialog
        applicationId="a1"
        version={3}
        currentRequisitionId="r1"
        open
        onOpenChange={() => {}}
        onDone={vi.fn()}
      />,
      { wrapper: wrap(qc) },
    );
    const dialog = screen.getByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: /target role/i })).toBeInTheDocument(),
    );
  });

  it('is not exposed as a dialog when closed', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <TransferDialog
        applicationId="a1"
        version={3}
        currentRequisitionId="r1"
        open={false}
        onOpenChange={() => {}}
        onDone={vi.fn()}
      />,
      { wrapper: wrap(qc) },
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
