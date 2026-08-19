import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AllocationPage } from '../../../src/pages/allocation-page.tsx';

let mockSearch: Record<string, unknown> = {};
let forceRerender: () => void = () => {};

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => (opts: { search: Record<string, unknown> }) => {
    mockSearch = opts.search;
    forceRerender();
  },
  useSearch: () => mockSearch,
}));

const mockFetchAllocationGrid = vi.fn();
vi.mock('../../../src/api/allocation-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/allocation-client.ts')>()),
  fetchAllocationGrid: (...args: unknown[]) => mockFetchAllocationGrid(...args),
  // UtilizationPanel (rendered unconditionally below the grid) fetches this on
  // its own — stub it so tests don't spam real network calls.
  fetchUtilizationByPerson: () => Promise.resolve({ as_of: '2026-07-16', rows: [] }),
}));

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    worker_id: 'w1',
    employee_no: 'E1',
    full_name: 'Ada Lovelace',
    account_id: 'a1',
    account_name: 'Acme',
    project_id: 'p1',
    project_name: 'Apollo',
    is_account_am: false,
    bucket: 'billable',
    months: new Array(12).fill(50),
    total_mm: 6,
    ...overrides,
  };
}

const baseGrid = {
  year: 2026,
  rows: [makeRow(), makeRow({ worker_id: 'w2', full_name: 'Grace Hopper', total_mm: 9 })],
  worker_totals: [],
  kpis: { avg_utilization: 80, over_allocated_count: 0, member_count: 2, project_count: 1 },
  facets: { accounts: [], projects: [] },
  effort_by_account: [{ account_id: 'a1', account_name: 'Acme', total_mm: 15 }],
};

function Harness() {
  const [, setTick] = useState(0);
  forceRerender = () => setTick((t) => t + 1);
  return <AllocationPage />;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe('AllocationPage (Astryx Table migration)', () => {
  it('renders the allocation grid rows', async () => {
    mockFetchAllocationGrid.mockResolvedValue(baseGrid);
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(table).getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('clicking the MM sort header reorders rows client-side (the one column with a real accessor)', async () => {
    const user = userEvent.setup();
    mockFetchAllocationGrid.mockResolvedValue(baseGrid);
    renderPage();

    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: /sort by mm/i }));

    const rows = within(table).getAllByRole('row');
    // row[0] is the header row; ascending MM puts Ada (6) before Grace (9).
    expect(within(rows[1]).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('toggling a column via the Columns popover hides it from the table', async () => {
    const user = userEvent.setup();
    mockFetchAllocationGrid.mockResolvedValue(baseGrid);
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Employee ID')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Employee ID' }));

    expect(within(table).queryByText('Employee ID')).not.toBeInTheDocument();
  });

  it('lists Name in the Columns popover as a fixed, non-toggleable column', async () => {
    const user = userEvent.setup();
    mockFetchAllocationGrid.mockResolvedValue(baseGrid);
    renderPage();

    const table = await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Columns' }));

    const nameCheckbox = screen.getByRole('checkbox', { name: 'Name' });
    expect(nameCheckbox).toBeChecked();
    expect(nameCheckbox).toHaveAttribute('aria-disabled', 'true');

    await user.click(nameCheckbox);

    expect(nameCheckbox).toBeChecked();
    expect(within(table).getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('paginates client-side over the fetched rows', async () => {
    const user = userEvent.setup();
    const manyRows = Array.from({ length: 30 }, (_, i) =>
      makeRow({ worker_id: `w${i}`, full_name: `Worker ${i}`, total_mm: i }),
    );
    mockFetchAllocationGrid.mockResolvedValue({ ...baseGrid, rows: manyRows });
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Worker 0')).toBeInTheDocument();
    expect(within(table).queryByText('Worker 10')).not.toBeInTheDocument();

    const pager = screen.getByRole('navigation', { name: 'Allocation pages' });
    expect(within(pager).getByText('Page 1 of 3')).toBeInTheDocument();
    await user.click(within(pager).getByRole('button', { name: /next page/i }));

    await waitFor(() => expect(within(table).getByText('Worker 10')).toBeInTheDocument());
    expect(within(pager).getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('shows more rows per page when a bigger page size is picked, from the first page', async () => {
    const user = userEvent.setup();
    const manyRows = Array.from({ length: 30 }, (_, i) =>
      makeRow({ worker_id: `w${i}`, full_name: `Worker ${i}`, total_mm: i }),
    );
    mockFetchAllocationGrid.mockResolvedValue({ ...baseGrid, rows: manyRows });
    renderPage();

    const table = await screen.findByRole('table');
    const pager = screen.getByRole('navigation', { name: 'Allocation pages' });
    await user.click(within(pager).getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(within(table).getByText('Worker 10')).toBeInTheDocument());

    await user.click(screen.getByRole('combobox', { name: 'Items per page' }));
    await user.click(await screen.findByRole('option', { name: '25' }));

    expect(within(pager).getByText('Page 1 of 2')).toBeInTheDocument();
    expect(within(table).getByText('Worker 0')).toBeInTheDocument();
    expect(within(table).getByText('Worker 24')).toBeInTheDocument();
  });

  it('resets to page 1 when the sort order changes while on page 2', async () => {
    // Matches the deleted DataTable's TanStack `autoResetPageIndex` default, which fired on
    // `sorting` state changes too, not just filters (getSortedRowModel unconditionally calls
    // `table._autoResetPageIndex()`).
    const user = userEvent.setup();
    const manyRows = Array.from({ length: 30 }, (_, i) =>
      makeRow({ worker_id: `w${i}`, full_name: `Worker ${i}`, total_mm: i }),
    );
    mockFetchAllocationGrid.mockResolvedValue({ ...baseGrid, rows: manyRows });
    renderPage();

    const table = await screen.findByRole('table');
    const pager = screen.getByRole('navigation', { name: 'Allocation pages' });
    await user.click(within(pager).getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(within(table).getByText('Worker 10')).toBeInTheDocument());

    await user.click(within(table).getByRole('button', { name: /sort by mm/i }));

    expect(within(pager).getByText('Page 1 of 3')).toBeInTheDocument();
    expect(within(table).getByText('Worker 0')).toBeInTheDocument();
    expect(within(table).queryByText('Worker 10')).not.toBeInTheDocument();
  });

  it('renders the empty state when there are no allocations', async () => {
    mockFetchAllocationGrid.mockResolvedValue({
      ...baseGrid,
      rows: [],
      effort_by_account: [],
    });
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('No allocations')).toBeInTheDocument();
  });

  it('renders effort-by-account donut and legend', async () => {
    mockFetchAllocationGrid.mockResolvedValue(baseGrid);
    renderPage();

    await screen.findByRole('heading', { name: /Effort by account/i });
    const region = await screen.findByRole('region', { name: 'Effort by account breakdown' });
    expect(within(region).getByText('Acme')).toBeInTheDocument();
    expect(within(region).getByText(/TOTAL:\s*15 MM/i)).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: /Acme/i })).toHaveTextContent('15');
  });

  it('collapses many accounts into Other with Show all', async () => {
    const user = userEvent.setup();
    const manyAccounts = Array.from({ length: 8 }, (_, i) => ({
      account_id: `a${i}`,
      account_name: `Account ${i}`,
      total_mm: 10 - i,
    }));
    mockFetchAllocationGrid.mockResolvedValue({
      ...baseGrid,
      effort_by_account: manyAccounts,
    });
    renderPage();

    const region = await screen.findByRole('region', { name: 'Effort by account breakdown' });
    expect(within(region).getByText('Account 0')).toBeInTheDocument();
    expect(within(region).getByText('Other (2)')).toBeInTheDocument();
    expect(within(region).queryByText('Account 7')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(within(region).getByText('Account 7')).toBeInTheDocument();
    expect(within(region).queryByText(/Other/)).not.toBeInTheDocument();
  });

  it('renders an empty state when effort_by_account is empty', async () => {
    mockFetchAllocationGrid.mockResolvedValue({ ...baseGrid, effort_by_account: [] });
    renderPage();

    expect(await screen.findByText('No effort in scope')).toBeInTheDocument();
  });

  it('renders the Export button enabled when allocation rows exist', async () => {
    mockFetchAllocationGrid.mockResolvedValue(baseGrid);
    renderPage();

    await screen.findByRole('table');
    const exportBtn = screen.getByRole('button', { name: /export/i });
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).not.toBeDisabled();
  });

  it('disables the Export button when there are no allocation rows', async () => {
    mockFetchAllocationGrid.mockResolvedValue({ ...baseGrid, rows: [] });
    renderPage();

    await screen.findByRole('table');
    const exportBtn = screen.getByRole('button', { name: /export/i });
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).toBeDisabled();
  });

  it('displays KPI cards from the fetched grid response', async () => {
    mockFetchAllocationGrid.mockResolvedValue({
      ...baseGrid,
      kpis: { avg_utilization: 95, over_allocated_count: 5, member_count: 42, project_count: 7 },
    });
    renderPage();

    await screen.findByRole('table');
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('7 projects')).toBeInTheDocument();
  });
});

describe('AllocationPage — breadcrumb trail (Astryx migration, FUT-668)', () => {
  it('renders the root + current crumb trail and the h1', async () => {
    mockFetchAllocationGrid.mockResolvedValue(baseGrid);
    renderPage();

    await screen.findByRole('table');

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'People' });
    expect(rootCrumb).toHaveAttribute('href', '/people');

    // Current (terminal) crumb — manifest label and page title agree here.
    expect(within(nav).getByText('Resource Allocation').closest('a')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Resource Allocation' }),
    ).toBeInTheDocument();
  });
});

describe('AllocationPage — search input space and typing UX', () => {
  it('preserves spaces when typing multi-word queries into the search bar', async () => {
    mockSearch = {};
    mockFetchAllocationGrid.mockResolvedValue(baseGrid);
    renderPage();

    await screen.findByRole('table');
    const searchInput = screen.getAllByPlaceholderText('Search name or employee ID…')[0];

    // Type first word
    userEvent.setup();
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'Ada' } });
    expect(searchInput).toHaveValue('Ada');

    // Wait for debounce to trigger navigation
    await waitFor(() => expect(mockSearch.q).toBe('Ada'));

    // Type space
    fireEvent.change(searchInput, { target: { value: 'Ada ' } });
    expect(searchInput).toHaveValue('Ada ');

    // Type second word
    fireEvent.change(searchInput, { target: { value: 'Ada Lovelace' } });
    expect(searchInput).toHaveValue('Ada Lovelace');

    await waitFor(() => expect(mockSearch.q).toBe('Ada Lovelace'));
  });

  it('instantly clears search query when search field is emptied', async () => {
    mockSearch = { q: 'Ada' };
    mockFetchAllocationGrid.mockResolvedValue(baseGrid);
    renderPage();

    await screen.findByRole('table');
    const searchInput = screen.getAllByPlaceholderText('Search name or employee ID…')[0];
    expect(searchInput).toHaveValue('Ada');

    fireEvent.change(searchInput, { target: { value: '' } });
    expect(searchInput).toHaveValue('');
    expect(mockSearch.q).toBeUndefined();
  });

  it('suspends search commit during IME composition and commits finalized text on composition end', async () => {
    mockSearch = {};
    mockFetchAllocationGrid.mockResolvedValue(baseGrid);
    renderPage();

    await screen.findByRole('table');
    const searchInput = screen.getAllByPlaceholderText('Search name or employee ID…')[0];

    fireEvent.compositionStart(searchInput);
    fireEvent.change(searchInput, { target: { value: 'Nguyee' } });

    expect(mockSearch.q).toBeUndefined();

    fireEvent.change(searchInput, { target: { value: 'Nguyễn' } });
    fireEvent.compositionEnd(searchInput, {
      currentTarget: { value: 'Nguyễn' },
    } as unknown as React.CompositionEvent<HTMLInputElement>);

    await waitFor(() => expect(mockSearch.q).toBe('Nguyễn'));
  });
});
