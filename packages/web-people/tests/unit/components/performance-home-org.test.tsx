import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformanceHome } from '../../../src/components/performance-home.tsx';
import { PerformanceScopeProvider } from '../../../src/state/performance-scope-context.tsx';

/** The org dashboard now reads the roll-up API; routing is what these tests assert. */
const EMPTY_ROLLUP = {
  month: '2026-08',
  cycle_status: 'open',
  scope: 'org',
  label: 'Company',
  groups: [],
  scores: {},
  scored: 0,
  total: 0,
  overall: null,
  rows: [],
  reviews: [],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(EMPTY_ROLLUP), { status: 200 })),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderOrgHome(opts: {
  role_slugs: string[];
  can_view_org: boolean;
  can_unlock?: boolean;
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <PerformanceScopeProvider
        value={{
          person_id: '99999999-9999-4999-8999-999999999999',
          role_slugs: opts.role_slugs,
          capacities: [],
          can_view_org: opts.can_view_org,
          can_unlock: opts.can_unlock ?? false,
          resolved: { mode: 'organization', month: '2026-08', capacity: null },
          search: { view: 'organization', month: '2026-08' },
          setMonth: () => {},
        }}
      >
        {children}
      </PerformanceScopeProvider>
    </QueryClientProvider>
  );
  return render(<PerformanceHome />, { wrapper });
}

describe('PerformanceHome in organization mode', () => {
  it('shows the org dashboard to a PMO/BoD org-viewer', async () => {
    renderOrgHome({ role_slugs: ['pm.pmo'], can_view_org: true });
    expect(await screen.findByText('Pillar scores by account')).toBeInTheDocument();
  });

  it('shows the org dashboard when the org-viewer also holds people.manager', async () => {
    // resolveDashboardId answers 'hr' for people.manager, but HR's own cycle-config
    // surface is a later ticket — an org-viewer must still get the org home rather
    // than a blank page (FUT-781).
    renderOrgHome({ role_slugs: ['people.manager', 'pm.pmo'], can_view_org: true });
    expect(await screen.findByText('Pillar scores by account')).toBeInTheDocument();
  });

  it('shows nothing to a capacity-less user without org access (no leak)', () => {
    renderOrgHome({ role_slugs: ['pm.viewer'], can_view_org: false });
    expect(screen.queryByText('Pillar scores by account')).not.toBeInTheDocument();
  });

  it('never mixes the unlock panel into the dashboard — it has its own tab', () => {
    renderOrgHome({ role_slugs: ['pm.pmo'], can_view_org: true, can_unlock: true });
    expect(screen.queryByTestId('cycle-unlock-panel')).not.toBeInTheDocument();
  });
});
