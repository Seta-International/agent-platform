import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RaSearch } from '../../../src/pages/ra-monitoring-page.tsx';
import { RaMonitoringPage } from '../../../src/pages/ra-monitoring-page.tsx';

vi.mock('@seta/web-identity', () => ({
  usePermission: () => true,
}));

// Stateful router mock: `navigate({ search })` mutates a module-level "URL",
// and `useSearch` always reads the latest value — lets the sort/column tests
// below observe how table interactions rewrite the query params, the same
// harness pattern as admin-audit-page.test.tsx.
let latestSearch: Partial<RaSearch> = {};
let forceRerender: () => void = () => {};

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => (opts: { search: Partial<RaSearch> }) => {
    latestSearch = opts.search;
    forceRerender();
  },
  useSearch: () => latestSearch,
}));

// SelectEmployeeDialog's Typeahead goes through useWorkerSource; stub it with an in-memory
// search so we don't need to mock the real people-search fetch endpoint (same rationale as
// charter-detail-page.test.tsx).
vi.mock('../../../src/api/worker-search.ts', () => ({
  useWorkerSource: () => ({
    source: {
      search: (q: string) => Promise.resolve(q ? [{ id: 'w9', label: 'Jane Doe' }] : []),
      bootstrap: () => Promise.resolve([]),
    },
    seed: () => Promise.resolve([]),
  }),
}));

const fetchAllocationsMock = vi.fn((_params?: unknown) => Promise.resolve<unknown[]>([]));

// `fetchProjectsMock` is a plain vi.fn (not a spy) so it survives the
// `vi.restoreAllMocks()` in each describe's afterEach; tests that need a
// different project set override it explicitly and reset it back.
const fetchProjectsMock = vi.fn(() =>
  Promise.resolve([
    {
      project_id: 'p1',
      account_id: 'acc1',
      name: 'Aeris - Watchtower',
      phase: 'build',
      status: 'active' as const,
      pm_worker_id: null,
      can_manage: true,
    },
  ]),
);

vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchAccounts: () =>
      Promise.resolve([
        {
          account_id: 'acc1',
          name: 'Aeris',
          industry: null,
          am_worker_id: null,
          recruiter_count: 0,
          project_count: 0,
        },
      ]),
    fetchProjects: (...args: unknown[]) => fetchProjectsMock(...args),
    fetchAllocations: (params: unknown) => fetchAllocationsMock(params),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RaMonitoringPage />
    </QueryClientProvider>,
  );
}

// Re-mounts the page under a real `useState` so the stateful router mock's
// `forceRerender()` actually triggers a React re-render.
function Harness() {
  const [, bump] = useState(0);
  forceRerender = () => bump((n) => n + 1);
  return <RaMonitoringPage />;
}

function renderTableHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe('RaMonitoringPage — SelectEmployeeDialog (Astryx migration smoke test)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // purpose="form" -> role="dialog". `canManageAny` requires at least one manageable project
  // (fetchProjects above returns one with can_manage: true) for the "Add allocation" trigger to
  // render at all.
  it('opens from the Add allocation trigger and closes via Cancel without selecting anyone', async () => {
    const user = userEvent.setup();
    renderPage();

    const trigger = await screen.findByRole('button', { name: 'Add allocation' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Select employee' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // No Reassign wizard should have opened either — onSelect only fires from Next.
    expect(screen.queryByRole('heading', { name: 'Jane Doe' })).not.toBeInTheDocument();
  });

  it('selecting an employee enables Next, and clicking it closes the Select employee dialog', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add allocation' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('button', { name: 'Next' })).toBeDisabled();

    const employeeField = within(dialog).getByLabelText('Employee');
    await user.click(employeeField);
    await user.type(employeeField, 'Jane');
    await user.click(await screen.findByRole('option', { name: 'Jane Doe' }));

    expect(within(dialog).getByRole('button', { name: 'Next' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));

    // Select employee dialog itself is done with its job once Next is clicked — it always
    // closes and hands off to the Reassign wizard (already covered by reassign-wizard.test.tsx).
    expect(screen.queryByRole('heading', { name: 'Select employee' })).not.toBeInTheDocument();
  });
});

// SplitAllocationDialog is deliberately NOT covered here. It's a parent-controlled dialog
// (`splitTarget`/`setSplitTarget`) — but no rendered control in the current RA Monitoring UI ever
// calls `setSplitTarget`. The table's "actions" column (ra-monitoring-page.tsx) renders only a
// "Reassign" button; there is no "Split"/"End early" affordance anywhere in the row, toolbar, or
// elsewhere on the page (confirmed via full-file review, a repo-wide grep for
// `SplitAllocationDialog`/`splitAllocation(`, and `git log` on this file — `setSplitTarget`/
// `splitTarget` have exactly their definition/plumbing sites and zero UI callers, unchanged by the
// Astryx Table migration, which only replaced the table's meta-prop plumbing with direct
// closures). The component also isn't exported, so it can't be unit-tested directly either.
// This looks like a pre-existing gap unrelated to either migration — flagged in the Task 2d2 fix
// report rather than worked around with a fabricated interaction or an out-of-scope production
// change (exporting the component / wiring a trigger) that this test-only fix isn't meant to make.
describe.todo(
  'RaMonitoringPage — SplitAllocationDialog: unreachable from the shipped UI, see comment above',
);

describe('RaMonitoringPage — table (Astryx Table + plugins)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    latestSearch = {};
    fetchAllocationsMock.mockReset();
    fetchAllocationsMock.mockResolvedValue([]);
  });

  // One worker with two allocations across two accounts so the secondary
  // (within-person) sort actually has something to reorder — `groupByPerson`
  // groups by person first, and this fixture has only one person.
  const allocations = [
    {
      allocation_id: 'a1',
      worker_id: 'w1',
      worker_name: 'Jane Doe',
      worker_title: 'Engineer',
      account_name: 'Zeta Corp',
      project_name: 'P1',
      planned_pct: 50,
      date_from: '2026-01-01',
      date_to: '2026-06-01',
      bucket: 'billable',
      status: 'committed',
      can_manage: true,
      note: null,
      version: 1,
    },
    {
      allocation_id: 'a2',
      worker_id: 'w1',
      worker_name: 'Jane Doe',
      worker_title: 'Engineer',
      account_name: 'Alpha Inc',
      project_name: 'P2',
      planned_pct: 50,
      // Later start date than a1, so the default secondary sort (`start`,
      // ascending) orders a1 (Zeta) before a2 (Alpha) — reverse-alphabetical
      // by account, so a click on "Sort by Account" has something to prove.
      date_from: '2026-02-01',
      date_to: '2026-06-01',
      bucket: 'billable',
      status: 'committed',
      can_manage: true,
      note: null,
      version: 1,
    },
  ];

  it('clicking "Sort by Account" updates the URL sort state and reorders the group', async () => {
    const user = userEvent.setup();
    fetchAllocationsMock.mockResolvedValue(allocations);
    renderTableHarness();

    const table = await screen.findByRole('table');
    // Default order (secondaryField 'start', ascending): Zeta (a1) before Alpha (a2).
    expect(screen.getAllByText(/Zeta Corp|Alpha Inc/)[0]).toHaveTextContent('Zeta Corp');

    await user.click(within(table).getByRole('button', { name: /sort by account/i }));

    expect(latestSearch).toMatchObject({ sort: 'account', dir: 'asc' });
    // Re-grouped ascending by account within Jane's group: Alpha before Zeta.
    expect(screen.getAllByText(/Zeta Corp|Alpha Inc/)[0]).toHaveTextContent('Alpha Inc');
  });

  it('hiding the Account column via the Columns toggle removes it from the table', async () => {
    const user = userEvent.setup();
    fetchAllocationsMock.mockResolvedValue(allocations);
    renderTableHarness();

    await screen.findByRole('table');
    expect(screen.getByText('Zeta Corp')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Account' }));

    expect(screen.queryByText('Zeta Corp')).not.toBeInTheDocument();
    expect(screen.queryByText('Alpha Inc')).not.toBeInTheDocument();
  });

  it('paginates client-side at 25/page (default pagination, previously undiscovered)', async () => {
    const user = userEvent.setup();
    // Astryx's pagination plugin doesn't render the nav at all for a single
    // page (unlike the old DataTablePagination, which always rendered a —
    // sanctioned — bar) — 26 single-row groups forces a genuine second page.
    const manyAllocations = Array.from({ length: 26 }, (_, i) => ({
      allocation_id: `m${i}`,
      worker_id: `w${i}`,
      worker_name: `Worker ${String(i).padStart(2, '0')}`,
      worker_title: 'Engineer',
      account_name: 'Zeta Corp',
      project_name: 'P1',
      planned_pct: 50,
      date_from: '2026-01-01',
      date_to: '2026-06-01',
      bucket: 'billable',
      status: 'committed',
      can_manage: true,
      note: null,
      version: 1,
    }));
    fetchAllocationsMock.mockResolvedValue(manyAllocations);
    renderTableHarness();

    await screen.findByRole('table');
    expect(screen.getByText('Worker 00')).toBeInTheDocument();
    expect(screen.queryByText('Worker 25')).not.toBeInTheDocument();

    const pager = screen.getByRole('navigation', { name: /table pagination/i });
    await user.click(within(pager).getByRole('button', { name: 'Go to page 2' }));

    expect(screen.getByText('Worker 25')).toBeInTheDocument();
    expect(screen.queryByText('Worker 00')).not.toBeInTheDocument();
  });
});

describe('RaMonitoringPage — Add-allocation wizard fetch scope (FUT-750)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    latestSearch = {};
    fetchAllocationsMock.mockReset();
    fetchAllocationsMock.mockResolvedValue([]);
  });

  const workerAllocations = [
    {
      allocation_id: 'a1',
      worker_id: 'w1',
      worker_name: 'Jane Doe',
      worker_title: 'Engineer',
      account_name: 'Zeta Corp',
      project_name: 'P1',
      planned_pct: 50,
      date_from: '2026-01-01',
      date_to: '2026-06-01',
      bucket: 'billable',
      status: 'committed',
      can_manage: true,
      note: null,
      version: 1,
    },
  ];

  // The wizard reviews a person's ENTIRE book for conflict / over-allocation, so opening it must
  // not inherit the list's project, account, search, OR active-period filters — any of those would
  // hide the person's other allocations, which are exactly what the conflict check has to see.
  it("scopes the wizard fetch to the worker's whole book, ignoring every page filter", async () => {
    const user = userEvent.setup();
    // Page is filtered by project + account + search AND a narrowed active-period window.
    latestSearch = {
      project: 'p1',
      account: 'acc1',
      q: 'jane',
      from: '2026-05-01',
      to: '2026-05-31',
    };
    fetchAllocationsMock.mockResolvedValue(workerAllocations);
    renderTableHarness();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Reassign' }));

    // The wizard fetch is the one scoped by worker_id; it must carry nothing else.
    await waitFor(() => {
      const wizardCalls = fetchAllocationsMock.mock.calls
        .map((c) => c[0] as Record<string, unknown> | undefined)
        .filter((p) => p?.worker_id != null);
      expect(wizardCalls.at(-1)).toEqual({ worker_id: 'w1' });
    });
  });

  it('renders grid Calendar Effort cell clipped to the active Date Range window', async () => {
    // Allocation spans entire 2026 year (12 months = 12.00 MM unclipped)
    const yearAllocation = [
      {
        allocation_id: 'a-year',
        worker_id: 'w1',
        worker_name: 'Phạm Tiến Mạnh',
        worker_title: 'Senior Engineer',
        project_id: 'p1',
        project_name: 'Alpha Project',
        account_id: 'acc1',
        account_name: 'Alpha Inc',
        planned_pct: 100,
        date_from: '2026-01-01',
        date_to: '2026-12-31',
        bucket: 'billable',
        status: 'committed',
        can_manage: true,
        note: null,
        version: 1,
      },
    ];

    // Filter by Date Range: 01 Aug 2026 to 31 Dec 2026 (5 full months = 5.00 MM)
    latestSearch = {
      from: '2026-08-01',
      to: '2026-12-31',
    };
    fetchAllocationsMock.mockResolvedValue(yearAllocation);
    renderTableHarness();

    await screen.findByRole('table');
    // Grid cell displays 5.00 MM (clipped to August-December window)
    expect(screen.getByText('5.00')).toBeInTheDocument();
  });
});

describe('RaMonitoringPage — Project filter over-allocation calculation (FUT-888)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    latestSearch = {};
    fetchAllocationsMock.mockReset();
    fetchAllocationsMock.mockResolvedValue([]);
  });

  it('keeps worker marked as Over-allocated when Project filter is applied', async () => {
    const p1Allocation = {
      allocation_id: 'a1',
      worker_id: 'w1',
      worker_name: 'Nguyen Thi Phuong',
      worker_title: 'Senior Engineer',
      project_id: 'p1',
      project_name: 'Project A',
      account_id: 'acc1',
      account_name: 'Veritone',
      planned_pct: 100,
      date_from: '2026-08-01',
      date_to: '2026-11-30',
      bucket: 'billable',
      status: 'committed',
      can_manage: true,
      note: null,
      version: 1,
    };
    const p2Allocation = {
      allocation_id: 'a2',
      worker_id: 'w1',
      worker_name: 'Nguyen Thi Phuong',
      worker_title: 'Senior Engineer',
      project_id: 'p2',
      project_name: 'Project B',
      account_id: 'acc1',
      account_name: 'Veritone',
      planned_pct: 100,
      date_from: '2026-08-01',
      date_to: '2026-11-30',
      bucket: 'billable',
      status: 'committed',
      can_manage: true,
      note: null,
      version: 1,
    };

    latestSearch = {
      project: 'p1',
    };

    fetchAllocationsMock.mockImplementation((params?: unknown) => {
      const p = params as Record<string, unknown> | undefined;
      if (p?.project_id === 'p1') {
        return Promise.resolve([p1Allocation]);
      }
      return Promise.resolve([p1Allocation, p2Allocation]);
    });

    renderTableHarness();

    await screen.findByRole('table');
    // Only Project A row is displayed in table
    expect(screen.getByText('Project A')).toBeInTheDocument();
    expect(screen.queryByText('Project B')).not.toBeInTheDocument();

    // Worker should still be marked with "Over" badge
    expect(screen.getByText('Over')).toBeInTheDocument();
  });
});

describe('RaMonitoringPage — breadcrumb trail (Astryx migration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    latestSearch = {};
  });

  it('renders the root crumb and the current (terminal) "RA Monitoring" crumb', async () => {
    renderPage();

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Project Monitoring' });
    expect(rootCrumb).toHaveAttribute('href', '/pm');

    // Current crumb — manifest label and page title agree ("RA Monitoring"), not a link.
    expect(within(nav).getByText('RA Monitoring').closest('a')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'RA Monitoring' })).toBeInTheDocument();
  });
});

describe('RaMonitoringPage — Scope card project count (FUT-841)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    latestSearch = {};
    fetchAllocationsMock.mockReset();
    fetchAllocationsMock.mockResolvedValue([]);
    // Reset the project list back to the shared default so later describe
    // blocks start from a known state (they reset allocations but not projects).
    fetchProjectsMock.mockReset();
    fetchProjectsMock.mockResolvedValue([
      {
        project_id: 'p1',
        account_id: 'acc1',
        name: 'Aeris - Watchtower',
        phase: 'build',
        status: 'active' as const,
        pm_worker_id: null,
        can_manage: true,
      },
    ]);
  });

  it('shows the account project count when only an account filter is set', async () => {
    fetchProjectsMock.mockResolvedValue([
      {
        project_id: 'p1',
        account_id: 'acc1',
        name: 'P1',
        phase: 'build',
        status: 'active',
        pm_worker_id: null,
        can_manage: true,
      },
      {
        project_id: 'p2',
        account_id: 'acc1',
        name: 'P2',
        phase: 'build',
        status: 'active',
        pm_worker_id: null,
        can_manage: true,
      },
      {
        project_id: 'p3',
        account_id: 'acc1',
        name: 'P3',
        phase: 'build',
        status: 'active',
        pm_worker_id: null,
        can_manage: true,
      },
    ]);
    latestSearch = { account: 'acc1' };

    renderTableHarness();
    await screen.findByRole('table');

    // account filter only → the account's full project set
    expect(screen.getByText('3 projects')).toBeInTheDocument();
  });

  it('shows 1 project when a single project is selected', async () => {
    fetchProjectsMock.mockResolvedValue([
      {
        project_id: 'p1',
        account_id: 'acc1',
        name: 'P1',
        phase: 'build',
        status: 'active',
        pm_worker_id: null,
        can_manage: true,
      },
      {
        project_id: 'p2',
        account_id: 'acc1',
        name: 'P2',
        phase: 'build',
        status: 'active',
        pm_worker_id: null,
        can_manage: true,
      },
    ]);
    latestSearch = { account: 'acc1', project: 'p1' };

    renderTableHarness();
    await screen.findByRole('table');

    // The count must reflect the single selected project, not the account total.
    expect(screen.getByText('1 project')).toBeInTheDocument();
  });
});

describe('RaMonitoringPage — Grouped allocations Person and Seniority display (FUT-837)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    latestSearch = {};
    fetchAllocationsMock.mockReset();
    fetchAllocationsMock.mockResolvedValue([]);
  });

  it('renders Person, Seniority, and Action on every row for a person with multiple allocations', async () => {
    const multiAllocations = [
      {
        allocation_id: 'a1',
        worker_id: 'w1',
        worker_name: 'Jane Doe',
        worker_title: 'Senior Engineer',
        account_name: 'Zeta Corp',
        project_name: 'Project Alpha',
        planned_pct: 50,
        date_from: '2026-01-01',
        date_to: '2026-06-01',
        bucket: 'billable',
        status: 'committed',
        can_manage: true,
        note: null,
        version: 1,
      },
      {
        allocation_id: 'a2',
        worker_id: 'w1',
        worker_name: 'Jane Doe',
        worker_title: 'Senior Engineer',
        account_name: 'Alpha Inc',
        project_name: 'Project Beta',
        planned_pct: 50,
        date_from: '2026-02-01',
        date_to: '2026-06-01',
        bucket: 'billable',
        status: 'committed',
        can_manage: true,
        note: null,
        version: 1,
      },
    ];

    fetchAllocationsMock.mockResolvedValue(multiAllocations);
    renderTableHarness();

    await screen.findByRole('table');

    // Both rows must render the person's name and seniority
    const names = screen.getAllByText('Jane Doe');
    expect(names).toHaveLength(2);

    const seniorities = screen.getAllByText('Senior Engineer');
    expect(seniorities).toHaveLength(2);

    const reassignButtons = screen.getAllByRole('button', { name: 'Reassign' });
    expect(reassignButtons).toHaveLength(2);
  });
});

describe('RaMonitoringPage — active date range guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    latestSearch = {};
    fetchAllocationsMock.mockReset();
    fetchAllocationsMock.mockResolvedValue([]);
  });

  it('refuses an Active-to date earlier than the Active-from date', async () => {
    latestSearch = { from: '2026-08-18', to: '2026-12-31' };
    renderTableHarness();

    const activeTo = await screen.findByRole('combobox', { name: 'Active to' });
    fireEvent.change(activeTo, { target: { value: '03/10/2025' } });

    expect(latestSearch.to).toBe('2026-12-31');
  });

  it('refuses an Active-from date later than the Active-to date', async () => {
    latestSearch = { from: '2026-08-18', to: '2026-12-31' };
    renderTableHarness();

    const activeFrom = await screen.findByRole('combobox', { name: 'Active from' });
    fireEvent.change(activeFrom, { target: { value: '12/31/2027' } });

    expect(latestSearch.from).toBe('2026-08-18');
  });

  it('still accepts an Active-to date inside the window', async () => {
    latestSearch = { from: '2026-08-18', to: '2026-12-31' };
    renderTableHarness();

    const activeTo = await screen.findByRole('combobox', { name: 'Active to' });
    fireEvent.change(activeTo, { target: { value: '10/15/2026' } });

    await waitFor(() => expect(latestSearch.to).toBe('2026-10-15'));
  });
});
