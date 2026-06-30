import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserDetailSheet } from '../../src/users/components/UserDetailSheet.tsx';

vi.mock('../../src/groups/api/groups-client.ts', () => ({
  listGroups: async () => [],
  listUserGroups: async () => [],
}));

vi.mock('../../src/groups/api/product-access-client.ts', () => ({
  listUserProducts: async () => [{ product_id: 'pm', source: 'role', effect: 'grant' }],
  setUserProductOverride: async () => {},
  clearUserProductOverride: async () => {},
}));

describe('user detail products', () => {
  it('renders product entitlement state', async () => {
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
    expect(await screen.findByText(/Project Monitoring/)).toBeInTheDocument();
  });
});
