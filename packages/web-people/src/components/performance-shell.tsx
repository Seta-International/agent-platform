import { Text } from '@seta/shared-ui';
import { Link, useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import type { PerformanceCapacity } from '../api/people-client.ts';
import { usePerformanceScope } from '../hooks/use-performance-scope.ts';
import { filterPerformanceNav, isPerformanceNavAllowed } from '../nav/performance-nav.ts';
import { navIdFromPath } from '../nav/performance-path.ts';
import type { PerformanceScopeSearch } from '../state/performance-scope.ts';
import { ProjectContextSwitcher } from './project-context-switcher.tsx';

export type PerformanceShellProps = {
  role_slugs: readonly string[];
  capacities: readonly PerformanceCapacity[];
  default_capacity_index: number;
  as_of_month: string;
  children: ReactNode;
};

/**
 * In-page Performance shell (SCR-02): secondary nav (affordance-filtered) +
 * header with cycle-badge slot (S1.3) + project-context switcher.
 * Suite AppShell already owns bell/avatar — do not duplicate.
 */
export function PerformanceShell({
  role_slugs,
  capacities,
  default_capacity_index,
  as_of_month,
  children,
}: PerformanceShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const urlSearch = useSearch({ strict: false }) as PerformanceScopeSearch;
  const { resolved, search, setCapacity } = usePerformanceScope({
    pathname,
    capacities,
    default_capacity_index,
    as_of_month,
  });

  const navItems = filterPerformanceNav(role_slugs, resolved.capacity);
  const activeId = navIdFromPath(pathname);
  // Prefer canonical resolved search for nav links so section switches keep scope.
  const linkSearch = { ...urlSearch, ...search };

  // Unauthorized deep-link → graceful /403 (AC1). Affordance only; server still authz later.
  useEffect(() => {
    if (!activeId) return;
    if (isPerformanceNavAllowed(activeId, role_slugs, resolved.capacity)) return;
    void navigate({ to: '/403' });
  }, [activeId, navigate, resolved.capacity, role_slugs]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
      <nav
        aria-label="Performance sections"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-hairline pb-2 md:w-48 md:flex-col md:overflow-x-visible md:border-b-0 md:border-r md:pb-0 md:pr-3"
        data-testid="performance-sidebar"
      >
        {navItems.map((item) => {
          const active = item.id === activeId;
          return (
            <Link
              key={item.id}
              to={item.to}
              search={linkSearch}
              className={
                active
                  ? 'rounded-md bg-surface-secondary px-3 py-2 text-sm font-medium whitespace-nowrap'
                  : 'rounded-md px-3 py-2 text-sm text-secondary whitespace-nowrap hover:bg-surface-secondary'
              }
              data-testid={`performance-nav-${item.id}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Cycle-status badge slot — Story 1.3 */}
          <div data-testid="performance-cycle-badge-slot" aria-hidden={true} />
          <ProjectContextSwitcher
            capacities={capacities}
            resolved={resolved}
            onSelect={setCapacity}
          />
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

/** Stub body for sections not yet built (S1.4 / E2). */
export function PerformanceSectionStub({ title }: { title: string }) {
  return (
    <Text color="secondary" data-testid="performance-section-stub">
      {title} — coming in a later story.
    </Text>
  );
}
