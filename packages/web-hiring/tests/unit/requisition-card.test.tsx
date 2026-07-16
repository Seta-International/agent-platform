import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequisitionListRow } from '../../src/api/hiring-client.ts';

const editRequisition = vi.fn();
const holdRequisition = vi.fn();
const resumeRequisition = vi.fn();
const closeRequisition = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  editRequisition: (id: string, input: unknown) => editRequisition(id, input),
  holdRequisition: (id: string, input: unknown) => holdRequisition(id, input),
  resumeRequisition: (id: string, input: unknown) => resumeRequisition(id, input),
  closeRequisition: (id: string, input: unknown) => closeRequisition(id, input),
  fetchCloseReasons: () =>
    Promise.resolve([{ id: 'cr1', label: 'No longer needed', active: true, version: 1 }]),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

import { RequisitionCard } from '../../src/pages/requisition-card.tsx';

function row(over: Partial<RequisitionListRow> = {}): RequisitionListRow {
  return {
    id: 'r1',
    title: 'Backend Engineer',
    role_title: null,
    account_id: null,
    account_name: null,
    project_id: null,
    project_name: null,
    grade: null,
    kind: 'new',
    approval_status: 'approved',
    stage: 'sourcing',
    status: 'open',
    note: null,
    start_date: null,
    due_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    skills: [],
    openings_total: 1,
    openings_open: 1,
    applicants_count: 0,
    applicants_internal: 0,
    applicants_external: 0,
    applicants: [],
    version: 1,
    ...over,
  };
}

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe('RequisitionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the stage track read-only — no stage-step buttons, no direct stage patch', () => {
    render(<RequisitionCard r={row()} canManage canClose />, { wrapper: wrap(newClient()) });

    expect(screen.getByText('Screening')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Screening/ })).not.toBeInTheDocument();
    expect(editRequisition).not.toHaveBeenCalled();
    expect(resumeRequisition).not.toHaveBeenCalled();
  });

  it('shows a Paused summary while on_hold, with no stage-step click target', () => {
    render(
      <RequisitionCard
        r={row({ status: 'on_hold', version: 2, updated_at: '2026-07-10T00:00:00Z' })}
        canManage
        canClose
      />,
      { wrapper: wrap(newClient()) },
    );

    expect(screen.queryByRole('button', { name: /Interview/ })).not.toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('Since 10 Jul 2026')).toBeInTheDocument();
  });

  it('hides the lifecycle menu once the requisition is filled or cancelled', () => {
    const { rerender } = render(
      <RequisitionCard r={row({ status: 'filled' })} canManage canClose />,
      { wrapper: wrap(newClient()) },
    );
    expect(screen.queryByRole('button', { name: 'Requisition actions' })).not.toBeInTheDocument();
    expect(screen.getByText('Filled')).toBeInTheDocument();

    rerender(<RequisitionCard r={row({ status: 'cancelled' })} canManage canClose />);
    expect(screen.queryByRole('button', { name: 'Requisition actions' })).not.toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('Pause calls holdRequisition', async () => {
    holdRequisition.mockResolvedValueOnce({ version: 2 });
    render(<RequisitionCard r={row()} canManage canClose />, { wrapper: wrap(newClient()) });

    await userEvent.click(screen.getByRole('button', { name: 'Requisition actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Pause' }));
    await waitFor(() =>
      expect(holdRequisition).toHaveBeenCalledWith('r1', { expected_version: 1 }),
    );
  });

  it('shows a per-stage bucket count under each stage, summing to applicants_count (FUT-558)', () => {
    render(
      <RequisitionCard
        r={row({
          applicants_count: 3,
          applicants: [
            { name: 'A', role: null, applied_date: '2026-07-01', stage: 'new', kind: 'external' },
            {
              name: 'B',
              role: null,
              applied_date: '2026-07-01',
              stage: 'screening',
              kind: 'external',
            },
            {
              name: 'C',
              role: null,
              applied_date: '2026-07-01',
              stage: 'interview',
              kind: 'external',
            },
          ],
        })}
        canManage
        canClose
      />,
      { wrapper: wrap(newClient()) },
    );
    // One candidate currently at each of Sourcing/Screening/Interview, none at Offer yet.
    const counts = screen.getAllByText(/^[0-9]+$/).map((el) => el.textContent);
    expect(counts).toEqual(['1', '1', '1', '0']);
  });

  it('moves the count from Sourcing to Screening as a candidate advances (FUT-558)', () => {
    const { rerender } = render(
      <RequisitionCard
        r={row({
          applicants_count: 1,
          applicants: [
            { name: 'A', role: null, applied_date: '2026-07-01', stage: 'new', kind: 'external' },
          ],
        })}
        canManage
        canClose
      />,
      { wrapper: wrap(newClient()) },
    );
    expect(screen.getAllByText(/^[0-9]+$/).map((el) => el.textContent)).toEqual([
      '1',
      '0',
      '0',
      '0',
    ]);

    rerender(
      <RequisitionCard
        r={row({
          applicants_count: 1,
          applicants: [
            {
              name: 'A',
              role: null,
              applied_date: '2026-07-01',
              stage: 'screening',
              kind: 'external',
            },
          ],
        })}
        canManage
        canClose
      />,
    );
    expect(screen.getAllByText(/^[0-9]+$/).map((el) => el.textContent)).toEqual([
      '0',
      '1',
      '0',
      '0',
    ]);
  });

  // "Mark filled" / "Cancel" opening their confirm dialogs is a one-line onSelect → setState
  // wire-up (see requisition-card.tsx); MarkFilledDialog and CancelRequisitionDialog each have
  // their own isolated unit tests. Rendering the DropdownMenu and an open Dialog/AlertDialog in
  // the same tree here hits a Radix FocusScope + happy-dom/jsdom recursion bug (menu-close and
  // dialog-open focus-traps overlapping) — a test-environment issue, not a product bug; the
  // real click-through path is covered by the e2e spec instead.
});
