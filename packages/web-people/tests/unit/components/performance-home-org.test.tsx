import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { PerformanceHome } from '../../../src/components/performance-home.tsx';
import { PerformanceScopeProvider } from '../../../src/state/performance-scope-context.tsx';

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
  it('shows the org dashboard to a PMO/BoD org-viewer', () => {
    renderOrgHome({ role_slugs: ['pm.pmo'], can_view_org: true });
    expect(screen.getByText('Pillar scores by account')).toBeInTheDocument();
  });

  it('shows the org dashboard when the org-viewer also holds people.manager', () => {
    // resolveDashboardId answers 'hr' for people.manager, but HR's own cycle-config
    // surface is a later ticket — an org-viewer must still get the org home rather
    // than a blank page (FUT-781).
    renderOrgHome({ role_slugs: ['people.manager', 'pm.pmo'], can_view_org: true });
    expect(screen.getByText('Pillar scores by account')).toBeInTheDocument();
  });

  it('shows nothing to a capacity-less user without org access (no leak)', () => {
    renderOrgHome({ role_slugs: ['pm.viewer'], can_view_org: false });
    expect(screen.queryByText('Pillar scores by account')).not.toBeInTheDocument();
  });

  it('hides the unlock panel unless the viewer holds the unlock permission', () => {
    renderOrgHome({ role_slugs: ['pm.pmo'], can_view_org: true, can_unlock: false });
    expect(screen.queryByTestId('cycle-unlock-panel')).not.toBeInTheDocument();
  });
});
