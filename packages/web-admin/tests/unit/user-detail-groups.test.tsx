import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserDetailSheet } from '../../src/users/components/UserDetailSheet.tsx';

vi.mock('../../src/groups/api/groups-client.ts', () => ({
  listGroups: async () => [
    {
      group_id: 'g',
      slug: 'hr',
      name: 'HR',
      kind: 'default',
      is_base: false,
      member_count: 1,
      roles: [],
    },
  ],
  listUserGroups: async () => [{ group_id: 'g', slug: 'hr', name: 'HR' }],
}));

// The sheet embeds WorkSection: stub its permission hook and data client.
vi.mock('@seta/web-identity', () => ({
  usePermission: () => false,
}));

vi.mock('../../src/users/api/work-client.ts', () => ({
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
  listWorkersBrief: async () => [],
  searchAccounts: async () => [],
  searchProjects: async () => [],
  patchWorker: async () => ({ worker_id: 'p1', version: 2 }),
  createWorkerAllocation: async () => ({ allocation_id: 'a1' }),
  deleteWorkerAllocation: async () => undefined,
}));

describe('user detail groups', () => {
  it('renders the user group memberships', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <UserDetailSheet
          row={{
            person_id: 'p1',
            full_name: 'Jane',
            work_email: 'jane@acme.test',
            job_title: null,
            employment_status: 'active',
            account_status: 'active',
            user_id: 'u1',
            roles: [],
            groups: [],
          }}
          open
          onOpenChange={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('HR')).toBeInTheDocument();
  });

  // The drawer is an Astryx Dialog: the avatar/name/email header is composed from stock
  // DialogHeader props (startContent/title/subtitle), and the accessible name comes from an
  // explicit `aria-label` because Dialog does not label itself from DialogHeader.
  it('exposes a named dialog whose header carries the name, email, and a close button', async () => {
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <UserDetailSheet
          row={{
            person_id: 'p1',
            full_name: 'Jane',
            work_email: 'jane@acme.test',
            job_title: null,
            employment_status: 'active',
            account_status: 'active',
            user_id: 'u1',
            roles: [],
            groups: [],
          }}
          open
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Jane' });
    expect(within(dialog).getByRole('heading', { name: 'Jane' })).toBeInTheDocument();
    expect(within(dialog).getByText('jane@acme.test')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
