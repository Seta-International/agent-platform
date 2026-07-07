import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
});
