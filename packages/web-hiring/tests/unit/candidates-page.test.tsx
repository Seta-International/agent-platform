import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateListItem } from '../../src/api/hiring-client.ts';
import { COLUMN_EMPTY_COPY } from '../../src/pages/candidate-utils.ts';
import { hiringKeys } from '../../src/state/query-keys.ts';

vi.mock('@seta/web-identity', () => ({ usePermission: () => true }));

const fetchCandidates = vi.fn();
const moveApplicationStage = vi.fn();
const hireApplication = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchCandidates: () => fetchCandidates(),
  moveApplicationStage: (id: string, input: { expected_version?: number; to: string }) =>
    moveApplicationStage(id, input),
  hireApplication: (id: string, input: { expected_version?: number }) => hireApplication(id, input),
  fetchRejectedCandidates: () => Promise.resolve([]),
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
    requisition_status: 'open',
    stage: 'new',
    status: 'active',
    rating: 0,
    version: 1,
    applied_at: '2024-01-01T00:00:00.000Z',
    skills: [],
    required_skills: [],
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
    requisition_status: 'open',
    stage: 'new',
    status: 'active',
    rating: 0,
    version: 1,
    applied_at: '2024-01-01T00:00:00.000Z',
    skills: [],
    required_skills: [],
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
    requisition_status: 'open',
    stage: 'new',
    status: 'active',
    rating: 0,
    version: 1,
    applied_at: '2024-01-02T00:00:00.000Z',
    skills: [],
    required_skills: [],
    fit: { met: 1, required: 2, score: 0.5, strong: false },
  },
];

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('CandidatesPage', () => {
  it('renders the breadcrumb trail and page heading', async () => {
    fetchCandidates.mockResolvedValue(rows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Hiring Management' });
    expect(rootCrumb).toHaveAttribute('href', '/hiring');
    expect(within(nav).getByText('Candidates').closest('a')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Candidates' })).toBeInTheDocument();
  });

  it('renders the board with the candidate card under New', async () => {
    fetchCandidates.mockResolvedValue(rows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    // Each stage label appears twice now: once in the stat segments, once as the board column
    // name — the segments were unified to the board's vocabulary (Interview/Offer, not the old
    // Interviewing/Offering) so the two surfaces read the same word.
    expect(screen.getAllByText('New').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Screening').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Interview').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Offer').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Hired').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the stage empty state via the column slot, not inside the droppable card list', async () => {
    // Only the "new" stage is populated — interview/screening/offer/hired are empty and
    // must show their stage copy through KanbanColumn's `emptyState` slot, not as a
    // rendered card inside the droppable list (Task 8, FUT-725).
    fetchCandidates.mockResolvedValue(rows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    expect(await screen.findByText(COLUMN_EMPTY_COPY.interview.title)).toBeInTheDocument();

    const droppable = document.querySelector('[data-rfd-droppable-id="interview"]');
    expect(droppable).not.toBeNull();
    expect(
      within(droppable as HTMLElement).queryByText(COLUMN_EMPTY_COPY.interview.title),
    ).not.toBeInTheDocument();
  });

  it('switches to list view', async () => {
    fetchCandidates.mockResolvedValue(rows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('radio', { name: 'List' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: /seniority/i })).toBeInTheDocument();
  });

  it('clicking "Sort by Candidate" reorders the rows', async () => {
    const user = userEvent.setup();
    fetchCandidates.mockResolvedValue(twoRows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Zed Zephyr')).toBeInTheDocument());
    await user.click(screen.getByRole('radio', { name: 'List' }));

    const table = await screen.findByRole('table');
    // Server order (unsorted): Zed before Ada.
    expect(screen.getAllByText(/Zed Zephyr|Ada Lovelace/)[0]).toHaveTextContent('Zed Zephyr');

    await user.click(within(table).getByRole('button', { name: /sort by candidate/i }));

    // Ascending by name: Ada before Zed.
    expect(screen.getAllByText(/Zed Zephyr|Ada Lovelace/)[0]).toHaveTextContent('Ada Lovelace');
  });

  // FUT-834: Candidate Stage column sorts by pipeline stage order (New → Screening → Interview → Offer),
  // not by the raw string alphabetically (Interview, New, Offer, Screening).
  it('sorting by Stage orders candidates in pipeline sequence', async () => {
    const user = userEvent.setup();
    const candidateRows: CandidateListItem[] = [
      {
        ...rows[0]!,
        application_id: 'a1',
        candidate_id: 'c1',
        name: 'Cand Interview',
        stage: 'interview',
      },
      {
        ...rows[0]!,
        application_id: 'a2',
        candidate_id: 'c2',
        name: 'Cand Screening',
        stage: 'screening',
      },
      { ...rows[0]!, application_id: 'a3', candidate_id: 'c3', name: 'Cand New', stage: 'new' },
      { ...rows[0]!, application_id: 'a4', candidate_id: 'c4', name: 'Cand Offer', stage: 'offer' },
    ];
    fetchCandidates.mockResolvedValue(candidateRows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Cand Interview')).toBeInTheDocument());
    await user.click(screen.getByRole('radio', { name: 'List' }));

    const table = await screen.findByRole('table');
    const header = within(table).getByRole('button', { name: /sort by stage/i });

    // First click: ascending pipeline order → New, Screening, Interview, Offer.
    await user.click(header);
    let dataRows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent ?? '');
    expect(dataRows.map((t) => t.match(/Cand (New|Screening|Interview|Offer)/)?.[0])).toEqual([
      'Cand New',
      'Cand Screening',
      'Cand Interview',
      'Cand Offer',
    ]);

    // Second click: descending pipeline order → Offer, Interview, Screening, New.
    await user.click(header);
    dataRows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent ?? '');
    expect(dataRows.map((t) => t.match(/Cand (New|Screening|Interview|Offer)/)?.[0])).toEqual([
      'Cand Offer',
      'Cand Interview',
      'Cand Screening',
      'Cand New',
    ]);
  });

  it('hiding the Seniority column via the Columns toggle removes it from the table', async () => {
    const user = userEvent.setup();
    fetchCandidates.mockResolvedValue(twoRows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Zed Zephyr')).toBeInTheDocument());
    await user.click(screen.getByRole('radio', { name: 'List' }));

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
      requisition_status: 'open',
      stage: 'new',
      status: 'active',
      rating: 0,
      version: 1,
      applied_at: '2024-01-01T00:00:00.000Z',
      skills: [],
      required_skills: [],
      fit: { met: 1, required: 2, score: 0.5, strong: false },
    }));
    fetchCandidates.mockResolvedValue(manyCandidates);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Candidate 00')).toBeInTheDocument());
    await user.click(screen.getByRole('radio', { name: 'List' }));

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
      requisition_status: 'open',
      stage: 'new',
      status: 'active',
      rating: 0,
      version: 1,
      applied_at: '2024-01-01T00:00:00.000Z',
      skills: [],
      required_skills: [],
      fit: { met: 1, required: 2, score: 0.5, strong: false },
    }));
    fetchCandidates.mockResolvedValue(manyCandidates);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Candidate 00')).toBeInTheDocument());
    await user.click(screen.getByRole('radio', { name: 'List' }));

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

  it('optimistically updates candidate stage in query cache on stage move mutation and rolls back on error', async () => {
    fetchCandidates.mockResolvedValue(rows);
    let rejectMove: (err: Error) => void = () => {};
    moveApplicationStage.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectMove = reject;
        }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    const initial = qc.getQueryData<CandidateListItem[]>(hiringKeys.candidates());
    expect(initial?.[0]?.stage).toBe('new');
    expect(initial?.[0]?.version).toBe(1);

    const { onBoardDragEnd } = await import('../../src/pages/candidates-page.tsx');

    const previousCandidates = qc.getQueryData<CandidateListItem[]>(hiringKeys.candidates());
    const handler = onBoardDragEnd(rows, (m) => {
      // Execute optimistic mutation update logic
      if (previousCandidates) {
        qc.setQueryData<CandidateListItem[]>(hiringKeys.candidates(), (old) =>
          old?.map((c) =>
            c.application_id === m.application_id
              ? { ...c, stage: m.to, version: c.version + 1 }
              : c,
          ),
        );
      }
      moveApplicationStage(m.application_id, m).catch(() => {
        if (previousCandidates) {
          qc.setQueryData(hiringKeys.candidates(), previousCandidates);
        }
      });
    });

    // Trigger drag drop
    handler({
      draggableId: 'a1',
      source: { droppableId: 'new', index: 0 },
      destination: { droppableId: 'screening', index: 0 },
    } as never);

    // Immediately check optimistic cache state
    const optimistic = qc.getQueryData<CandidateListItem[]>(hiringKeys.candidates());
    expect(optimistic?.[0]?.stage).toBe('screening');
    expect(optimistic?.[0]?.version).toBe(2);

    // Now trigger rejection
    rejectMove(new Error('Network error'));
    await waitFor(() => {
      const rolledBack = qc.getQueryData<CandidateListItem[]>(hiringKeys.candidates());
      expect(rolledBack?.[0]?.stage).toBe('new');
      expect(rolledBack?.[0]?.version).toBe(1);
    });
  });
});
