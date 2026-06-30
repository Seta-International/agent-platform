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
      role_slugs: [],
    },
  ],
  listUserGroups: async () => [{ group_id: 'g', slug: 'hr', name: 'HR' }],
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
          }}
          open
          onOpenChange={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('HR')).toBeInTheDocument();
  });
});
