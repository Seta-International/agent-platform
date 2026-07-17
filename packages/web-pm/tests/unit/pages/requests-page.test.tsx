import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CharterListRow } from '../../../src/api/pm-client.ts';
import { RequestsPage } from '../../../src/pages/requests-page.tsx';

vi.mock('@seta/web-identity', () => ({
  usePermission: () => true,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  // Pin the page straight into the "Table" view so tests exercise the inner
  // client-side table (search/sort/pager) without needing a click to switch views.
  useSearch: () => ({ view: 'table' }),
}));

vi.mock('../../../src/api/worker-search.ts', () => ({
  useWorkerSource: () => ({
    source: { search: () => Promise.resolve([]), bootstrap: () => Promise.resolve([]) },
    seed: () => Promise.resolve([]),
  }),
}));

const fetchChartersMock = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchCharters: (...args: unknown[]) => fetchChartersMock(...args),
    fetchCharterSummary: () =>
      Promise.resolve({ total: 0, submitted: 0, pmo_approved: 0, approved: 0, rejected: 0 }),
    fetchAccounts: () => Promise.resolve([]),
  };
});

function row(overrides: Partial<CharterListRow>): CharterListRow {
  return {
    charter_id: 'c0',
    account_id: 'acc1',
    name: 'Charter',
    status: 'submitted',
    rejected_stage: null,
    pm_worker_id: null,
    budget_bmm: null,
    team_size: null,
    methodology: null,
    pricing_model: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RequestsPage />
    </QueryClientProvider>,
  );
}

describe('RequestsPage — inner table view (sort · pagination parity)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchChartersMock.mockReset();
  });

  it('resets the inner table page to 1 when the sort order changes while on page 2', async () => {
    // The inner "table view" stacks its own client-side search/sort/pager on top of the
    // page's server-driven outer pager (see the block comment above TABLE_PAGE_SIZE in
    // requests-page.tsx) — it inherited the same TanStack `autoResetPageIndex` default as
    // every other migrated client-mode table (getSortedRowModel unconditionally calls
    // `table._autoResetPageIndex()`; `manualPagination` was never set here).
    const user = userEvent.setup();
    const manyCharters = Array.from({ length: 26 }, (_, i) =>
      row({ charter_id: `c${i}`, name: `Charter ${String(i).padStart(2, '0')}` }),
    );
    fetchChartersMock.mockResolvedValue({ charters: manyCharters, total: manyCharters.length });
    renderPage();

    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('Charter 00')).toBeInTheDocument());

    const pager = screen.getByRole('navigation', { name: /table pagination/i });
    await user.click(within(pager).getByRole('button', { name: 'Go to page 2' }));
    expect(within(table).getByText('Charter 25')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: /sort by project/i }));

    expect(within(pager).getByRole('button', { name: 'Go to page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(table).getByText('Charter 00')).toBeInTheDocument();
    expect(within(table).queryByText('Charter 25')).not.toBeInTheDocument();
  });
});

describe('RequestsPage — breadcrumb trail (Astryx migration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchChartersMock.mockReset();
  });

  // Manifest nav label for /pm/requests is "Requests"; this page's own title is "Project
  // Requests" — they disagree, so the footnote's title-wins clause fires and the *current*
  // crumb is "Project Requests" (unlike the middle crumb on charter-detail-page, which still
  // reads "Requests" — see the asymmetry note in the task report).
  it('renders the root crumb and the current (terminal) "Project Requests" crumb', async () => {
    fetchChartersMock.mockResolvedValue({ charters: [], total: 0 });
    renderPage();

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Project Monitoring' });
    expect(rootCrumb).toHaveAttribute('href', '/pm');

    expect(within(nav).getByText('Project Requests').closest('a')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Project Requests' })).toBeInTheDocument();
  });
});
