import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Directory } from '../../../src/users/pages/Directory.tsx';

vi.mock('../../../src/users/hooks/useDirectory.ts', () => ({
  useDirectory: vi.fn(),
  useProvision: vi.fn(),
  useSuspend: vi.fn(),
  useReactivate: vi.fn(),
  useBulkRole: vi.fn(),
}));

vi.mock('@seta/web-identity', () => ({
  usePermission: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/role-access/hooks/useRoleAccess.ts', () => ({
  useRoleAccessMatrix: vi.fn(),
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
  },
];

const noop = vi.fn();

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

async function setupMocks(opts: { canWrite?: boolean } = {}) {
  const hooks = await import('../../../src/users/hooks/useDirectory.ts');
  const identity = await import('@seta/web-identity');
  const roleAccess = await import('../../../src/role-access/hooks/useRoleAccess.ts');

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
  (hooks.useBulkRole as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: noop,
    isPending: false,
  });
  (roleAccess.useRoleAccessMatrix as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [{ slug: 'identity.admin', description: 'Identity Admin', module: 'identity' }],
    isLoading: false,
  });
  (identity.usePermission as ReturnType<typeof vi.fn>).mockReturnValue(opts.canWrite ?? false);
  return hooks;
}

describe('Directory page', () => {
  it('renders one badge per account_status variant (none/active/suspended)', async () => {
    await setupMocks();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Directory />, { wrapper: wrap(qc) });

    await waitFor(() => {
      expect(screen.getByText('No account')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Suspended')).toBeInTheDocument();
    });
  });

  it('calls useDirectory with search when user types in the search input', async () => {
    const hooks = await setupMocks();

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Directory />, { wrapper: wrap(qc) });

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
    render(<Directory />, { wrapper: wrap(qc) });

    const trigger = await screen.findByRole('button', { name: /row actions for alice/i });
    await userEvent.click(trigger);
    const provisionItem = await screen.findByRole('menuitem', { name: /provision/i });
    await userEvent.click(provisionItem);

    expect(mockMutate).toHaveBeenCalledWith('p1');
  });

  it('bulk bar: shows count, excludes none-account rows, calls useBulkRole on confirm', async () => {
    const mockBulkMutate = vi.fn();
    const hooks = await setupMocks({ canWrite: true });
    (hooks.useBulkRole as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockBulkMutate,
      isPending: false,
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Directory />, { wrapper: wrap(qc) });

    // Wait for rows to render
    await waitFor(() => screen.getAllByRole('checkbox', { name: /select row/i }));
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: /select row/i });
    // Alice is 'none' account → checkbox disabled
    expect(rowCheckboxes[0]).toBeDisabled();

    // Select Bob (user_id='u2')
    await userEvent.click(rowCheckboxes[1]);
    await waitFor(() => expect(screen.getByText(/selected/)).toBeInTheDocument());
    // Re-query after re-render to get fresh references, then select Carol (user_id='u3')
    const freshCheckboxes = screen.getAllByRole('checkbox', { name: /select row/i });
    await userEvent.click(freshCheckboxes[2]);

    // Bulk bar shows "2 selected"
    await waitFor(() => expect(screen.getByText('2 selected')).toBeInTheDocument());

    // Open the role combobox and pick identity.admin
    const rolePicker = screen.getByRole('combobox', { name: /role/i });
    await userEvent.click(rolePicker);
    const roleOption = await screen.findByRole('option', { name: /identity.admin/i });
    await userEvent.click(roleOption);

    // Click Assign → confirm dialog appears
    const assignBtn = screen.getByRole('button', { name: /^assign$/i });
    await userEvent.click(assignBtn);
    const confirmBtn = await screen.findByRole('button', { name: /^confirm$/i });
    await userEvent.click(confirmBtn);

    // useBulkRole.mutate called with both account user_ids and correct role/action
    expect(mockBulkMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        user_ids: expect.arrayContaining(['u2', 'u3']),
        role_slug: 'identity.admin',
        action: 'grant',
      }),
      expect.any(Object),
    );
    // Alice's user_id (null) must NOT appear
    const [calledBody] = mockBulkMutate.mock.calls[0] as [{ user_ids: string[] }];
    expect(calledBody.user_ids).not.toContain(null);
    expect(calledBody.user_ids).toHaveLength(2);
  });

  it('clicking a row opens the detail sheet with person details', async () => {
    await setupMocks({ canWrite: false });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Directory />, { wrapper: wrap(qc) });

    const aliceCell = await screen.findByText('Alice');
    await userEvent.click(aliceCell);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('alice@test.com')).toBeInTheDocument();
  });
});
