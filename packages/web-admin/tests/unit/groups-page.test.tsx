import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GroupsPage } from '../../src/groups/pages/Groups.tsx';

vi.mock('../../src/groups/api/groups-client.ts', () => ({
  listGroups: async () => [
    {
      group_id: 'g',
      slug: 'hr',
      name: 'HR',
      kind: 'default',
      is_base: false,
      member_count: 3,
      role_slugs: ['people.strategic'],
    },
  ],
}));

// useMemberSearch uses useQueryClient — stub the search fns so no fetch is issued
vi.mock('../../src/feature-flags/api/member-search.ts', () => ({
  useMemberSearch: () => ({
    search: async () => [],
    resolveByIds: async () => [],
  }),
}));

describe('GroupsPage', () => {
  it('renders groups', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GroupsPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('HR')).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeInTheDocument();
  });
});
