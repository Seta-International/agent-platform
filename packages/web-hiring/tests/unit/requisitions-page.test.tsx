import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { OpenRequisitionsBoard, RequisitionListRow } from '../../src/api/hiring-client.ts';

vi.mock('@seta/web-identity', () => ({ usePermission: () => true }));

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}));

const fetchOpenRequisitions = vi.fn();
const fetchRequisitions = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchOpenRequisitions: () => fetchOpenRequisitions(),
  fetchRequisitions: () => fetchRequisitions(),
  fetchAccounts: () => Promise.resolve([]),
  fetchProjects: () => Promise.resolve([]),
}));

import { RequisitionsPage } from '../../src/pages/requisitions-page.tsx';

function row(over: Partial<RequisitionListRow> = {}): RequisitionListRow {
  return {
    id: 'r1',
    title: 'Backend Engineer',
    role_title: null,
    account_id: null,
    account_name: 'Zeta Corp',
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
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    skills: [],
    openings_total: 1,
    openings_open: 1,
    applicants_count: 0,
    applicants_internal: 0,
    applicants_external: 0,
    hired_count: 0,
    applicants: [],
    version: 1,
    ...over,
  };
}

// Two requisitions, alphabetically reversed by title — gives "Sort by Position" something to prove.
const twoRows: RequisitionListRow[] = [
  row({ id: 'r1', title: 'Zeta Engineer', account_name: 'Zeta Corp' }),
  row({ id: 'r2', title: 'Ada Engineer', account_name: 'Alpha Inc' }),
];

function board(requisitions: RequisitionListRow[]): OpenRequisitionsBoard {
  return {
    scope: 'all',
    scoped_account_names: [],
    scoped_project_names: [],
    requisitions,
  };
}

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

async function renderListView(rows: RequisitionListRow[]) {
  fetchOpenRequisitions.mockResolvedValue(board(rows));
  fetchRequisitions.mockResolvedValue(rows);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(<RequisitionsPage />, { wrapper: wrap(qc) });
  await waitFor(() => expect(screen.getByText(rows[0]!.title)).toBeInTheDocument());
  await user.click(screen.getByRole('radio', { name: 'List' }));
  const table = await screen.findByRole('table');
  return { user, table };
}

describe('RequisitionsPage', () => {
  it('renders the breadcrumb trail and page heading', async () => {
    fetchOpenRequisitions.mockResolvedValue(board([row()]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<RequisitionsPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Backend Engineer')).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Hiring Management' });
    expect(rootCrumb).toHaveAttribute('href', '/hiring');
    expect(within(nav).getByText('Requisitions').closest('a')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Requisitions' })).toBeInTheDocument();

    // "Open positions" also legitimately appears as a stat-tile label elsewhere on this page, so
    // scope to the nav to prove specifically that the old breadcrumb strings are gone from the
    // trail, not that they're absent from the page entirely.
    expect(within(nav).queryByText('Hiring management')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Open positions')).not.toBeInTheDocument();
  });

  it('switches to list view', async () => {
    const { table } = await renderListView([row()]);
    expect(within(table).getByRole('columnheader', { name: /position/i })).toBeInTheDocument();
  });

  // FUT-769: the pipeline cell shows a Hired figure alongside the four stage buckets, and the
  // tooltip spells it out — hired applicants are terminal, so the count comes from hired_count,
  // not the active applicants array.
  it('shows the hired figure in the pipeline cell and tooltip', async () => {
    const { user, table } = await renderListView([
      row({ applicants_count: 2, hired_count: 3, applicants: [] }),
    ]);
    // The inline spans concatenate without whitespace; the em dash sets off the Hired figure.
    const pipelineCell = within(table)
      .getAllByText((_, el) => el?.textContent === '2·0·0·0—3')
      .at(-1);
    expect(pipelineCell).toBeInTheDocument();

    await user.hover(pipelineCell!);
    expect(
      await screen.findByText('New 2 · Screening 0 · Interview 0 · Offer 0 · Hired 3'),
    ).toBeInTheDocument();
  });

  // FUT-765 follow-up: the total tile is labelled "Total" (not "Total open" — it counts every
  // status, not just open) and reflects the active filters like the other three tiles, so the
  // number always matches the requisitions actually on screen.
  it('labels the total tile "Total" and counts only the filtered requisitions', async () => {
    // stat() renders the value then the label as adjacent siblings; the label's previous
    // sibling is the number.
    const totalValue = () => {
      const label = screen.getByText('Total');
      const value = label.previousElementSibling;
      if (!value) throw new Error('total tile has no value node');
      return value as HTMLElement;
    };
    fetchOpenRequisitions.mockResolvedValue(
      board([
        row({ id: 'r1', title: 'Open A', status: 'open' }),
        row({ id: 'r2', title: 'Open B', status: 'open' }),
        row({ id: 'r3', title: 'Filled C', status: 'filled' }),
      ]),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<RequisitionsPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Open A')).toBeInTheDocument());

    // Renamed label, and the misleading "Total open" is gone.
    expect(screen.queryByText('Total open')).not.toBeInTheDocument();
    // Unfiltered: all three board requisitions.
    expect(totalValue()).toHaveTextContent('3');

    // Filtering to Filled leaves one requisition — the tile must follow.
    await user.click(screen.getByRole('combobox', { name: /filter by status/i }));
    await user.click(await screen.findByRole('option', { name: 'Filled' }));

    await waitFor(() => expect(totalValue()).toHaveTextContent('1'));
  });

  // FUT-878: the board carries the same dataset as the list view, including cancelled — so
  // switching views preserves the requisitions and dashboard stats. The cancelled role renders
  // on the board by default; filtering to "Cancelled" narrows to just it.
  it('shows cancelled requisitions on the board by default and narrows via the Cancelled filter', async () => {
    fetchOpenRequisitions.mockResolvedValue(
      board([
        row({ id: 'r1', title: 'Open A', status: 'open' }),
        row({ id: 'c1', title: 'Abandoned Role', status: 'cancelled' }),
      ]),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<RequisitionsPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Open A')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Abandoned Role')).toBeInTheDocument());

    await user.click(screen.getByRole('combobox', { name: /filter by status/i }));
    await user.click(await screen.findByRole('option', { name: 'Cancelled' }));

    await waitFor(() => expect(screen.queryByText('Open A')).not.toBeInTheDocument());
    expect(screen.getByText('Abandoned Role')).toBeInTheDocument();
  });

  // FUT-834: the Stage column sorts by the requisition's pipeline order (Sourcing → Screening →
  // Interview → Offer), not by the raw enum string alphabetically (Interview, Offer, Screening,
  // Sourcing). Two open reqs whose raw stage strings sort oppositely to the pipeline prove it.
  it('sorting by Stage orders the pipeline sequence, not the enum alphabetically', async () => {
    const { user, table } = await renderListView([
      row({ id: 'r1', title: 'Alpha Role', stage: 'interview', status: 'open' }),
      row({ id: 'r2', title: 'Beta Role', stage: 'screening', status: 'open' }),
    ]);
    // Server order: Interview before Screening.
    expect(screen.getAllByText(/Alpha Role|Beta Role/)[0]).toHaveTextContent('Alpha Role');

    await user.click(within(table).getByRole('button', { name: /sort by stage/i }));

    // Pipeline ascending: Screening (stage index 1) before Interview (index 2).
    expect(screen.getAllByText(/Alpha Role|Beta Role/)[0]).toHaveTextContent('Beta Role');
  });

  // FUT-834: non-open requisitions sort AFTER every open one (they show a lifecycle word, not a
  // pipeline stage), and among themselves follow STATUS_ORDER (On hold → Filled → Cancelled).
  it('sorting by Stage groups non-open requisitions after open ones in status order', async () => {
    const { user, table } = await renderListView([
      row({ id: 'r1', title: 'Filled Role', stage: 'offer', status: 'filled' }),
      row({ id: 'r2', title: 'Open Offer Role', stage: 'offer', status: 'open' }),
      row({ id: 'r3', title: 'Held Role', stage: 'sourcing', status: 'on_hold' }),
      row({ id: 'r4', title: 'Cancelled Role', stage: 'interview', status: 'cancelled' }),
    ]);

    await user.click(within(table).getByRole('button', { name: /sort by stage/i }));

    // Data rows follow the header row; the first row is the header.
    const dataRows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent ?? '');
    expect(dataRows[0]).toContain('Open Offer Role');
    expect(dataRows[1]).toContain('Held Role');
    expect(dataRows[2]).toContain('Filled Role');
    expect(dataRows[3]).toContain('Cancelled Role');
  });

  // FUT-834: clicking Stage again flips the order — second click must not "stick" at the same
  // stage. Ascending puts Screening first, descending puts Interview first.
  it('sorting by Stage toggles ascending then descending on repeat clicks', async () => {
    const { user, table } = await renderListView([
      row({ id: 'r1', title: 'Alpha Role', stage: 'interview', status: 'open' }),
      row({ id: 'r2', title: 'Beta Role', stage: 'screening', status: 'open' }),
      row({ id: 'r3', title: 'Gamma Role', stage: 'sourcing', status: 'open' }),
      row({ id: 'r4', title: 'Delta Role', stage: 'offer', status: 'open' }),
    ]);

    const header = within(table).getByRole('button', { name: /sort by stage/i });

    // First click: ascending pipeline order → Sourcing, Screening, Interview, Offer.
    await user.click(header);
    let rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent ?? '');
    expect(rows.map((t) => t.match(/Gamma|Beta|Alpha|Delta/)?.[0])).toEqual([
      'Gamma',
      'Beta',
      'Alpha',
      'Delta',
    ]);

    // Second click: descending → Offer, Interview, Screening, Sourcing.
    await user.click(header);
    rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent ?? '');
    expect(rows.map((t) => t.match(/Gamma|Beta|Alpha|Delta/)?.[0])).toEqual([
      'Delta',
      'Alpha',
      'Beta',
      'Gamma',
    ]);
  });

  it('clicking "Sort by Position" reorders the rows', async () => {
    const { user, table } = await renderListView(twoRows);
    // Server order: Zeta before Ada.
    expect(screen.getAllByText(/Zeta Engineer|Ada Engineer/)[0]).toHaveTextContent('Zeta Engineer');

    await user.click(within(table).getByRole('button', { name: /sort by position/i }));

    // Ascending by title: Ada before Zeta.
    expect(screen.getAllByText(/Zeta Engineer|Ada Engineer/)[0]).toHaveTextContent('Ada Engineer');
  });

  it('hiding the Account column via the Columns toggle removes it from the table', async () => {
    const { user, table } = await renderListView(twoRows);
    expect(within(table).getByRole('columnheader', { name: /account/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Account' }));

    expect(within(table).queryByRole('columnheader', { name: /account/i })).not.toBeInTheDocument();
  });

  it('clicking a row navigates to the requisition detail', async () => {
    const { user, table } = await renderListView([row()]);
    // The Position cell wraps its text in a Tooltip, which mirrors the label into an
    // aria-describedby node — two text matches for the same row, so click via the row itself.
    const dataRow = within(table).getAllByRole('row')[1] as HTMLElement;
    await user.click(dataRow);

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/hiring/requisitions',
        search: expect.any(Function),
      }),
    );
    const call = navigate.mock.calls.find((c) => c[0]?.to === '/hiring/requisitions');
    expect(call?.[0].search({})).toEqual({ selectedRequisitionId: 'r1' });
  });

  it('paginates client-side at 25/page', async () => {
    const manyRows = Array.from({ length: 26 }, (_, i) =>
      row({ id: `r${i}`, title: `Requisition ${String(i).padStart(2, '0')}` }),
    );
    const { user, table } = await renderListView(manyRows);
    // The Position cell's Tooltip mirrors the label, so scope to the table and expect 2 matches
    // (trigger + aria-describedby mirror) rather than 1.
    expect(within(table).getAllByText('Requisition 00')).toHaveLength(2);
    expect(within(table).queryAllByText('Requisition 25')).toHaveLength(0);

    const pager = screen.getByRole('navigation', { name: /table pagination/i });
    await user.click(within(pager).getByRole('button', { name: 'Go to page 2' }));

    expect(within(table).getAllByText('Requisition 25')).toHaveLength(2);
    expect(within(table).queryAllByText('Requisition 00')).toHaveLength(0);
  });

  it('resets to page 1 when the sort order changes while on page 2', async () => {
    // Matches the deleted DataTable's TanStack `autoResetPageIndex` default, which fired on
    // `sorting` state changes too, not just filters (getSortedRowModel unconditionally calls
    // `table._autoResetPageIndex()`).
    const manyRows = Array.from({ length: 26 }, (_, i) =>
      row({ id: `r${i}`, title: `Requisition ${String(i).padStart(2, '0')}` }),
    );
    const { user, table } = await renderListView(manyRows);

    const pager = screen.getByRole('navigation', { name: /table pagination/i });
    await user.click(within(pager).getByRole('button', { name: 'Go to page 2' }));
    expect(within(table).getAllByText('Requisition 25')).toHaveLength(2);

    await user.click(within(table).getByRole('button', { name: /sort by position/i }));

    expect(within(pager).getByRole('button', { name: 'Go to page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(table).getAllByText('Requisition 00')).toHaveLength(2);
    expect(within(table).queryAllByText('Requisition 25')).toHaveLength(0);
  });
});
