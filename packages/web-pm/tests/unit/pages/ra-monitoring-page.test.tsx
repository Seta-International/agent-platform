import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RaMonitoringPage } from '../../../src/pages/ra-monitoring-page.tsx';

vi.mock('@seta/web-identity', () => ({
  usePermission: () => true,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
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
    fetchProjects: () =>
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
    fetchAllocations: () => Promise.resolve([]),
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

    const trigger = await screen.findByRole(
      'button',
      { name: 'Add allocation' },
      { timeout: 5000 },
    );
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

    await user.click(
      await screen.findByRole('button', { name: 'Add allocation' }, { timeout: 5000 }),
    );
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('button', { name: 'Next' })).toBeDisabled();

    const employeeField = within(dialog).getByLabelText('Employee');
    await user.click(employeeField);
    await user.type(employeeField, 'Jane');
    await user.click(await screen.findByRole('option', { name: 'Jane Doe' }, { timeout: 5000 }));

    expect(within(dialog).getByRole('button', { name: 'Next' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));

    // Select employee dialog itself is done with its job once Next is clicked — it always
    // closes and hands off to the Reassign wizard (already covered by reassign-wizard.test.tsx).
    expect(screen.queryByRole('heading', { name: 'Select employee' })).not.toBeInTheDocument();
  }, 15_000);
});

// SplitAllocationDialog is deliberately NOT covered here. It's a parent-controlled dialog
// (`splitTarget`/`setSplitTarget`) with a fully-wired `RaTableMeta.onSplit` callback — but no
// rendered control in the current RA Monitoring UI ever calls it. The table's "actions" column
// (ra-monitoring-page.tsx) renders only a "Reassign" button; there is no "Split"/"End early"
// affordance anywhere in the row, toolbar, or elsewhere on the page (confirmed via full-file
// review, a repo-wide grep for `SplitAllocationDialog`/`splitAllocation(`, and `git log` on this
// file — `onSplit`/`splitTarget` have exactly their definition/plumbing sites and zero UI
// callers). The component also isn't exported, so it can't be unit-tested directly either.
// This looks like a pre-existing gap unrelated to the Astryx Dialog migration (the migration
// only swapped the Dialog primitive, it didn't remove a trigger) — flagged in the Task 2d2 fix
// report rather than worked around with a fabricated interaction or an out-of-scope production
// change (exporting the component / wiring a trigger) that this test-only fix isn't meant to make.
describe.todo(
  'RaMonitoringPage — SplitAllocationDialog: unreachable from the shipped UI, see comment above',
);
