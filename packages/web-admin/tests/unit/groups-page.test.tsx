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
      roles: [{ role_slug: 'people.manager', scope_kind: 'tenant', scope_id: null }],
    },
  ],
}));

describe('GroupsPage', () => {
  it('lists groups and opens the first in the detail pane', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GroupsPage />
      </QueryClientProvider>,
    );
    // The group surfaces in both the list and the auto-selected detail header.
    expect((await screen.findAllByText('HR')).length).toBeGreaterThan(0);
    // The detail pane renders the slug and the Roles section.
    expect(await screen.findByText('hr')).toBeInTheDocument();
    expect(await screen.findByText('Roles')).toBeInTheDocument();
  });
});
