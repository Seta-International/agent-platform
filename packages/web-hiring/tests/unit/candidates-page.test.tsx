import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateListItem } from '../../src/api/hiring-client.ts';

vi.mock('@seta/web-identity', () => ({ usePermission: () => true }));

const fetchCandidates = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchCandidates: () => fetchCandidates(),
  fetchCandidateStageCounts: () =>
    Promise.resolve({ new: 1, screening: 0, interview: 0, offer: 0, hired: 0, cancelled: 0 }),
  fetchRequisitions: () => Promise.resolve([{ id: 'r1', title: 'Backend Eng', status: 'open' }]),
}));

import { CandidatesPage } from '../../src/pages/candidates-page.tsx';

const rows: CandidateListItem[] = [
  {
    application_id: 'a1',
    candidate_id: 'c1',
    name: 'Ada Lovelace',
    seniority: 'Senior',
    source: 'Referral',
    requisition_id: 'r1',
    requisition_title: 'Backend Eng',
    stage: 'new',
    status: 'active',
    rating: 0,
    version: 1,
    applied_at: '2024-01-01T00:00:00.000Z',
    skills: [],
    fit: { met: 1, required: 2, score: 0.5, strong: false },
  },
];

// Two candidates, alphabetically reversed by name — gives "Sort by Candidate" something to prove.
const twoRows: CandidateListItem[] = [
  {
    application_id: 'a1',
    candidate_id: 'c1',
    name: 'Zed Zephyr',
    seniority: 'Senior',
    source: 'Referral',
    requisition_id: 'r1',
    requisition_title: 'Backend Eng',
    stage: 'new',
    status: 'active',
    rating: 0,
    version: 1,
    applied_at: '2024-01-01T00:00:00.000Z',
    skills: [],
    fit: { met: 1, required: 2, score: 0.5, strong: false },
  },
  {
    application_id: 'a2',
    candidate_id: 'c2',
    name: 'Ada Lovelace',
    seniority: 'Junior',
    source: 'Referral',
    requisition_id: 'r1',
    requisition_title: 'Backend Eng',
    stage: 'new',
    status: 'active',
    rating: 0,
    version: 1,
    applied_at: '2024-01-02T00:00:00.000Z',
    skills: [],
    fit: { met: 1, required: 2, score: 0.5, strong: false },
  },
];

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('CandidatesPage', () => {
  it('renders the board with the candidate card under New', async () => {
    fetchCandidates.mockResolvedValue(rows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    // "New"/"Screening"/"Hired" each appear twice (stat segment label + board column name).
    expect(screen.getAllByText('New').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Screening').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Interview')).toBeInTheDocument();
    expect(screen.getByText('Offer')).toBeInTheDocument();
    expect(screen.getAllByText('Hired').length).toBeGreaterThanOrEqual(2);
  });

  it('switches to list view', async () => {
    fetchCandidates.mockResolvedValue(rows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('tab', { name: 'List' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: /seniority/i })).toBeInTheDocument();
  });

  it('clicking "Sort by Candidate" reorders the rows', async () => {
    const user = userEvent.setup();
    fetchCandidates.mockResolvedValue(twoRows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Zed Zephyr')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'List' }));

    const table = await screen.findByRole('table');
    // Server order (unsorted): Zed before Ada.
    expect(screen.getAllByText(/Zed Zephyr|Ada Lovelace/)[0]).toHaveTextContent('Zed Zephyr');

    await user.click(within(table).getByRole('button', { name: /sort by candidate/i }));

    // Ascending by name: Ada before Zed.
    expect(screen.getAllByText(/Zed Zephyr|Ada Lovelace/)[0]).toHaveTextContent('Ada Lovelace');
  });

  it('hiding the Seniority column via the Columns toggle removes it from the table', async () => {
    const user = userEvent.setup();
    fetchCandidates.mockResolvedValue(twoRows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Zed Zephyr')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'List' }));

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: /seniority/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Seniority' }));

    expect(
      within(table).queryByRole('columnheader', { name: /seniority/i }),
    ).not.toBeInTheDocument();
  });

  it('paginates client-side at 25/page', async () => {
    const user = userEvent.setup();
    const manyCandidates: CandidateListItem[] = Array.from({ length: 26 }, (_, i) => ({
      application_id: `a${i}`,
      candidate_id: `c${i}`,
      name: `Candidate ${String(i).padStart(2, '0')}`,
      seniority: 'Senior',
      source: 'Referral',
      requisition_id: 'r1',
      requisition_title: 'Backend Eng',
      stage: 'new',
      status: 'active',
      rating: 0,
      version: 1,
      applied_at: '2024-01-01T00:00:00.000Z',
      skills: [],
      fit: { met: 1, required: 2, score: 0.5, strong: false },
    }));
    fetchCandidates.mockResolvedValue(manyCandidates);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Candidate 00')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'List' }));

    await screen.findByRole('table');
    expect(screen.getByText('Candidate 00')).toBeInTheDocument();
    expect(screen.queryByText('Candidate 25')).not.toBeInTheDocument();

    const pager = screen.getByRole('navigation', { name: /table pagination/i });
    await user.click(within(pager).getByRole('button', { name: 'Go to page 2' }));

    expect(screen.getByText('Candidate 25')).toBeInTheDocument();
    expect(screen.queryByText('Candidate 00')).not.toBeInTheDocument();
  });

  it('resets to page 1 when the sort order changes while on page 2', async () => {
    // Matches the deleted DataTable's TanStack `autoResetPageIndex` default, which fired on
    // `sorting` state changes too, not just filters (getSortedRowModel unconditionally calls
    // `table._autoResetPageIndex()`).
    const user = userEvent.setup();
    const manyCandidates: CandidateListItem[] = Array.from({ length: 26 }, (_, i) => ({
      application_id: `a${i}`,
      candidate_id: `c${i}`,
      name: `Candidate ${String(i).padStart(2, '0')}`,
      seniority: 'Senior',
      source: 'Referral',
      requisition_id: 'r1',
      requisition_title: 'Backend Eng',
      stage: 'new',
      status: 'active',
      rating: 0,
      version: 1,
      applied_at: '2024-01-01T00:00:00.000Z',
      skills: [],
      fit: { met: 1, required: 2, score: 0.5, strong: false },
    }));
    fetchCandidates.mockResolvedValue(manyCandidates);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Candidate 00')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'List' }));

    const table = await screen.findByRole('table');
    const pager = screen.getByRole('navigation', { name: /table pagination/i });
    await user.click(within(pager).getByRole('button', { name: 'Go to page 2' }));
    expect(screen.getByText('Candidate 25')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: /sort by candidate/i }));

    expect(within(pager).getByRole('button', { name: 'Go to page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Candidate 00')).toBeInTheDocument();
    expect(screen.queryByText('Candidate 25')).not.toBeInTheDocument();
  });
});
