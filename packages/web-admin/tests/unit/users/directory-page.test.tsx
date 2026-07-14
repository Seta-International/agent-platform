import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DirectorySearch } from '../../../src/users/directory-search.ts';
import { Directory } from '../../../src/users/pages/Directory.tsx';

// Mirrors the route: holds the URL search state and feeds it to the page.
function Harness() {
  const [search, setSearch] = useState<DirectorySearch>({});
  return <Directory search={search} onSearch={(next) => setSearch((p) => next(p))} />;
}

vi.mock('../../../src/users/hooks/useDirectory.ts', () => ({
  useDirectory: vi.fn(),
  useProvision: vi.fn(),
  useSuspend: vi.fn(),
  useReactivate: vi.fn(),
}));

vi.mock('@seta/web-identity', () => ({
  usePermission: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/groups/hooks/useGroups.ts', () => ({
  useGroupsQuery: vi.fn(),
  useGroupMembersMutations: vi.fn(),
  useUserGroups: vi.fn().mockReturnValue({ data: [] }),
}));

vi.mock('../../../src/users/hooks/useWork.ts', () => ({
  useWorkersBrief: vi.fn().mockReturnValue({ data: [] }),
  useWorkerProfile: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
  useWorkerAllocations: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useOrgUnits: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useWorkMutations: vi.fn().mockReturnValue({
    editWorker: { mutate: vi.fn(), isPending: false },
    addAllocation: { mutate: vi.fn(), isPending: false },
    removeAllocation: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock('../../../src/users/api/work-client.ts', () => ({
  listWorkersBrief: async () => [],
  getWorkerProfile: async () => ({
    worker_id: 'p1',
    job_title: null,
    org_unit_id: null,
    org_unit_name: null,
    version: 1,
    lifecycle_stage: 'active',
    accounts: [],
    projects: [],
  }),
  listWorkerAllocations: async () => [],
  listOrgUnits: async () => [],
  searchAccounts: async () => [],
  searchProjects: async () => [],
  patchWorker: async () => ({ worker_id: 'p1', version: 2 }),
  createWorkerAllocation: async () => ({ allocation_id: 'a1' }),
  deleteWorkerAllocation: async () => undefined,
}));

const mockRows = [
  {
    person_id: 'p1',
    full_name: 'Alice',
    work_email: 'alice@test.com',
    job_title: 'Engineer',
    employment_status: 'active' as const,
    account_status: 'none' as const,
    user_id: null,
    roles: [],
    groups: [],
  },
  {
    person_id: 'p2',
    full_name: 'Bob',
    work_email: 'bob@test.com',
    job_title: 'Manager',
    employment_status: 'active' as const,
    account_status: 'active' as const,
    user_id: 'u2',
    roles: ['admin'],
    groups: ['Engineering'],
  },
  {
    person_id: 'p3',
    full_name: 'Carol',
    work_email: 'carol@test.com',
    job_title: 'Director',
    employment_status: 'active' as const,
    account_status: 'suspended' as const,
    user_id: 'u3',
    roles: [],
    groups: [],
  },
];

const mockGroup = {
  group_id: 'g1',
  slug: 'engineering',
  name: 'Engineering',
  kind: 'custom' as const,
  is_base: false,
  member_count: 0,
  roles: [],
};

const noop = vi.fn();

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

async function setupMocks(opts: { canWrite?: boolean; addMutate?: ReturnType<typeof vi.fn> } = {}) {
  const hooks = await import('../../../src/users/hooks/useDirectory.ts');
  const identity = await import('@seta/web-identity');
  const groups = await import('../../../src/groups/hooks/useGroups.ts');

  (hooks.useDirectory as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { rows: mockRows, page: 0, hasMore: false },
    isLoading: false,
  });
  (hooks.useProvision as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: noop,
    isPending: false,
  });
  (hooks.useSuspend as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: noop,
    isPending: false,
  });
  (hooks.useReactivate as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: noop,
    isPending: false,
  });
  (groups.useGroupsQuery as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [mockGroup],
    isLoading: false,
  });
  (groups.useGroupMembersMutations as ReturnType<typeof vi.fn>).mockReturnValue({
    add: { mutate: opts.addMutate ?? noop, isPending: false },
    remove: { mutate: noop, isPending: false },
  });
  (identity.usePermission as ReturnType<typeof vi.fn>).mockReturnValue(opts.canWrite ?? false);
  return hooks;
}

describe('Directory page', () => {
  it('renders one badge per account_status variant (none/active/suspended)', async () => {
    await setupMocks();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrap(qc) });

    // Scoped to the table: a page-wide text query would also match the same
    // strings sitting (hidden, but DOM-present) in the "Filter by account
    // status" Selector's own option list.
    await waitFor(() => {
      const table = screen.getByRole('table');
      expect(within(table).getByText('No account')).toBeInTheDocument();
      expect(within(table).getByText('Active')).toBeInTheDocument();
      expect(within(table).getByText('Suspended')).toBeInTheDocument();
    });
  });

  it('calls useDirectory with search when user types in the search input', async () => {
    const hooks = await setupMocks();

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrap(qc) });

    const input = screen.getByRole('textbox', { name: /search people/i });
    await userEvent.type(input, 'alice');

    expect(hooks.useDirectory as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'alice' }),
    );
  });

  it('Provision action calls useProvision().mutate with person_id', async () => {
    const mockMutate = vi.fn();
    const hooks = await setupMocks({ canWrite: true });
    (hooks.useProvision as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrap(qc) });

    const trigger = await screen.findByRole('button', { name: /row actions for alice/i });
    await userEvent.click(trigger);
    const provisionItem = await screen.findByRole('menuitem', { name: /provision/i });
    await userEvent.click(provisionItem);

    expect(mockMutate).toHaveBeenCalledWith('p1');
  });

  it('bulk bar: shows count, excludes none-account rows, adds selection to a group on confirm', async () => {
    const user = userEvent.setup();
    const mockAdd = vi.fn();
    await setupMocks({ canWrite: true, addMutate: mockAdd });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrap(qc) });

    await waitFor(() => screen.getAllByRole('checkbox', { name: /select row/i }));
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: /select row/i });
    // Alice is 'none' account → checkbox disabled
    expect(rowCheckboxes[0]).toBeDisabled();

    // Select Bob (u2)
    await user.click(rowCheckboxes[1]);
    await waitFor(() => expect(screen.getByText(/selected/)).toBeInTheDocument());
    // Re-query then select Carol (u3)
    const freshCheckboxes = screen.getAllByRole('checkbox', { name: /select row/i });
    await user.click(freshCheckboxes[2]);
    await waitFor(() => expect(screen.getByText('2 selected')).toBeInTheDocument());

    // Pick the target group
    const groupPicker = screen.getByRole('combobox', { name: /^group$/i });
    await user.click(groupPicker);
    const groupOption = await screen.findByRole('option', { name: /engineering/i });
    await user.click(groupOption);

    // Open + confirm the dialog
    await user.click(screen.getByRole('button', { name: /add to group/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /add to group/i }));

    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'g1',
        user_ids: expect.arrayContaining(['u2', 'u3']),
      }),
      expect.any(Object),
    );
    const [calledBody] = mockAdd.mock.calls[0] as [{ user_ids: string[] }];
    expect(calledBody.user_ids).not.toContain(null);
    expect(calledBody.user_ids).toHaveLength(2);
  }, 15_000);

  it('bulk bar: selection persists across pagination (accumulator)', async () => {
    const user = userEvent.setup();
    const mockAdd = vi.fn();
    const hooks = await setupMocks({ canWrite: true, addMutate: mockAdd });

    const page2Rows = [
      {
        person_id: 'p4',
        full_name: 'Dave',
        work_email: 'dave@test.com',
        job_title: 'Lead',
        employment_status: 'active' as const,
        account_status: 'active' as const,
        user_id: 'u4',
        roles: [],
        groups: [],
      },
    ];

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(<Harness />, { wrapper: wrap(qc) });

    // Select two account rows on page 1 (Bob, Carol)
    await waitFor(() => screen.getAllByRole('checkbox', { name: /select row/i }));
    let checkboxes = screen.getAllByRole('checkbox', { name: /select row/i });
    await user.click(checkboxes[1]);
    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());
    checkboxes = screen.getAllByRole('checkbox', { name: /select row/i });
    await user.click(checkboxes[2]);
    await waitFor(() => expect(screen.getByText('2 selected')).toBeInTheDocument());

    // Paginate → page 2 returns one new account row (Dave / u4)
    (hooks.useDirectory as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { rows: page2Rows, page: 1, hasMore: false },
      isLoading: false,
    });
    rerender(<Harness />);

    await waitFor(() => screen.getByText('Dave'));
    const page2Checkboxes = screen.getAllByRole('checkbox', { name: /select row/i });
    await user.click(page2Checkboxes[0]);
    await waitFor(() => expect(screen.getByText('3 selected')).toBeInTheDocument());

    // Add all three to a group
    const groupPicker = screen.getByRole('combobox', { name: /^group$/i });
    await user.click(groupPicker);
    await user.click(await screen.findByRole('option', { name: /engineering/i }));
    await user.click(screen.getByRole('button', { name: /add to group/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /add to group/i }));

    const [calledBody] = mockAdd.mock.calls[0] as [{ user_ids: string[] }];
    expect(calledBody.user_ids).toHaveLength(3);
    expect(calledBody.user_ids).toEqual(expect.arrayContaining(['u2', 'u3', 'u4']));
  }, 15_000);

  it('clicking a row opens the detail sheet with person details', async () => {
    await setupMocks({ canWrite: false });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrap(qc) });

    const aliceCell = await screen.findByText('Alice');
    await userEvent.click(aliceCell);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('alice@test.com')).toBeInTheDocument();
  });
});
