import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Directory } from '../../../src/users/pages/Directory.tsx';

vi.mock('../../../src/users/hooks/useDirectory.ts', () => ({
  useDirectory: vi.fn(),
}));

vi.mock('@seta/web-identity', () => ({
  usePermission: vi.fn().mockReturnValue(false),
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
    roles: [],
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

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('Directory page', () => {
  it('renders one badge per account_status variant (none/active/suspended)', async () => {
    const { useDirectory } = await import('../../../src/users/hooks/useDirectory.ts');
    (useDirectory as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { rows: mockRows, page: 0, hasMore: false },
      isLoading: false,
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Directory />, { wrapper: wrap(qc) });

    await waitFor(() => {
      expect(screen.getByText('No account')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Suspended')).toBeInTheDocument();
    });
  });

  it('calls useDirectory with search when user types in the search input', async () => {
    const { useDirectory } = await import('../../../src/users/hooks/useDirectory.ts');
    const mockUseDirectory = useDirectory as ReturnType<typeof vi.fn>;
    mockUseDirectory.mockReturnValue({
      data: { rows: [], page: 0, hasMore: false },
      isLoading: false,
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Directory />, { wrapper: wrap(qc) });

    const input = screen.getByRole('textbox', { name: /search people/i });
    await userEvent.type(input, 'alice');

    expect(mockUseDirectory).toHaveBeenCalledWith(expect.objectContaining({ search: 'alice' }));
  });
});
