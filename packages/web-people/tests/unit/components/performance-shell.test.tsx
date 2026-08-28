import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformanceShell } from '../../../src/components/performance-shell.tsx';

const navigate = vi.fn();
let pathname = '/people/performance';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname } }),
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
  beforeEach(() => {
    navigate.mockClear();
    pathname = '/people/performance';
  });

  it('capacity-less org viewer without unlock: no top tabs; shows cycle badge + switcher', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PerformanceShell
          role_slugs={['pm.pmo']}
          capacities={[]}
          default_capacity_index={-1}
          can_view_org={true}
          can_unlock={false}
          as_of_month="2026-07"
        >
          <div>body</div>
        </PerformanceShell>
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId('performance-top-tabs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('performance-sidebar')).not.toBeInTheDocument();
    expect(screen.getByTestId('performance-context-switcher')).toHaveTextContent('Organization');
    expect(screen.getByTestId('performance-cycle-badge-slot')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('cycle-status-badge')).toHaveTextContent(
        'Open (25th–end of month)',
      ),
    );
  });

  it('unlock permission: Cycle unlock gets its own tab, and hides the period picker there', () => {
    pathname = '/people/performance/cycle';
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PerformanceShell
          role_slugs={['pm.pmo']}
          capacities={[]}
          default_capacity_index={-1}
          can_view_org={true}
          can_unlock={true}
          as_of_month="2026-07"
        >
          <div>body</div>
        </PerformanceShell>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('performance-top-tabs')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Reviews' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Cycle unlock' })).toBeChecked();
    // The unlockable month is fixed by the server, so a period picker would be dead.
    expect(screen.queryByTestId('performance-period-selector')).not.toBeInTheDocument();
    // A permitted section must never bounce back to Reviews (scope sync stays on /cycle).
    expect(navigate.mock.calls.map((c) => (c[0] as { to: string }).to)).not.toContain(
      '/people/performance',
    );
  });

  it('AM capacity: Shows Reviews | Configuration top tabs', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PerformanceShell
          role_slugs={['people.viewer']}
          capacities={[{ kind: 'am', account_id: 'a1', label: 'Contoso' }]}
          default_capacity_index={0}
          can_view_org={false}
          can_unlock={false}
          as_of_month="2026-07"
        >
          <div>body</div>
        </PerformanceShell>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('performance-top-tabs')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Reviews' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Configuration' })).toBeInTheDocument();
    expect(screen.getByTestId('performance-context-switcher')).toHaveTextContent('AM · Contoso');
  });

  it('TL capacity: no top tabs (single reviews workspace)', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PerformanceShell
          role_slugs={['people.viewer']}
          capacities={[{ kind: 'tl', project_id: 'p1', account_id: 'a1', label: 'Atlas' }]}
          default_capacity_index={0}
          can_view_org={false}
          can_unlock={false}
          as_of_month="2026-07"
        >
          <div>body</div>
        </PerformanceShell>
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId('performance-top-tabs')).not.toBeInTheDocument();
    expect(screen.getByTestId('performance-context-switcher')).toHaveTextContent('TL · Atlas');
  });

  it('does not redirect to /403 when pathname leaves Performance (route exit)', async () => {
    pathname = '/people';
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PerformanceShell
          role_slugs={['people.viewer']}
          capacities={[{ kind: 'tl', project_id: 'p1', account_id: 'a1', label: 'Atlas' }]}
          default_capacity_index={0}
          can_view_org={false}
          can_unlock={false}
          as_of_month="2026-07"
        >
          <div>body</div>
        </PerformanceShell>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(navigate).not.toHaveBeenCalledWith(expect.objectContaining({ to: '/403' }));
    });
  });

  it('falls back to the Reviews home (not /403) when a section does not fit the capacity', async () => {
    // e.g. a non-AM context on the Configuration tab — a navigation concern,
    // not a permission error.
    pathname = '/people/performance/configuration';
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PerformanceShell
          role_slugs={['people.viewer']}
          capacities={[{ kind: 'tl', project_id: 'p1', account_id: 'a1', label: 'Atlas' }]}
          default_capacity_index={0}
          can_view_org={false}
          can_unlock={false}
          as_of_month="2026-07"
        >
          <div>body</div>
        </PerformanceShell>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/people/performance', replace: true }),
      );
    });
    expect(navigate).not.toHaveBeenCalledWith(expect.objectContaining({ to: '/403' }));
  });
});
