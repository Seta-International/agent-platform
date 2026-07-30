import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PerformanceShell } from '../../../src/components/performance-shell.tsx';

const navigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: '/people/performance' } }),
  useSearch: () => ({}),
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
    search?: unknown;
    'data-testid'?: string;
  }) => (
    <a href={to} data-testid={rest['data-testid']} className={rest.className}>
      {children}
    </a>
  ),
}));

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchCycleStatus: vi.fn(async () => ({
    month: '2026-07',
    status: 'open' as const,
    evaluated_at: '2026-07-26T03:00:00.000Z',
  })),
}));

describe('PerformanceShell', () => {
  it('PMO: hides Scoring/Self-assessment; shows Dashboard/Audit/Cycle (AC1)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PerformanceShell
          role_slugs={['pm.pmo']}
          capacities={[]}
          default_capacity_index={-1}
          as_of_month="2026-07"
        >
          <div>body</div>
        </PerformanceShell>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('performance-nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('performance-nav-audit')).toBeInTheDocument();
    expect(screen.getByTestId('performance-nav-cycle')).toBeInTheDocument();
    expect(screen.queryByTestId('performance-nav-scoring')).not.toBeInTheDocument();
    expect(screen.queryByTestId('performance-nav-self-assessment')).not.toBeInTheDocument();
    expect(screen.getByTestId('performance-context-switcher')).toHaveTextContent('Organization');
    expect(screen.getByTestId('performance-cycle-badge-slot')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('cycle-status-badge')).toHaveTextContent(
        'Open (25th–end of month)',
      ),
    );
  });

  it('TL capacity: shows Scoring, hides Self-assessment', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PerformanceShell
          role_slugs={['people.viewer']}
          capacities={[{ kind: 'tl', project_id: 'p1', account_id: 'a1', label: 'Atlas' }]}
          default_capacity_index={0}
          as_of_month="2026-07"
        >
          <div>body</div>
        </PerformanceShell>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('performance-nav-scoring')).toBeInTheDocument();
    expect(screen.queryByTestId('performance-nav-self-assessment')).not.toBeInTheDocument();
    expect(screen.getByTestId('performance-context-switcher')).toHaveTextContent('TL · Atlas');
  });
});
