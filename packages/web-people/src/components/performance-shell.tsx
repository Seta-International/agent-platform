import { Text } from '@seta/shared-ui';
import { Link, useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import type { PerformanceCapacity } from '../api/people-client.ts';
import { usePerformanceScope } from '../hooks/use-performance-scope.ts';
import { filterPerformanceNav, isPerformanceNavAllowed } from '../nav/performance-nav.ts';
import { navIdFromPath } from '../nav/performance-path.ts';
import type { PerformanceScopeSearch } from '../state/performance-scope.ts';
import { PerformanceScopeProvider } from '../state/performance-scope-context.tsx';
import { CycleStatusBadgeLoader } from './cycle-status-badge-loader.tsx';
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
 * header with cycle-status badge + project-context switcher.
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
  const linkSearch = { ...urlSearch, ...search };
  const cycleMonth = resolved.month;

  useEffect(() => {
    if (!activeId) return;
    if (isPerformanceNavAllowed(activeId, role_slugs, resolved.capacity)) return;
    void navigate({ to: '/403' });
  }, [activeId, navigate, resolved.capacity, role_slugs]);

  return (
    <PerformanceScopeProvider value={{ role_slugs, capacities, resolved, search }}>
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
            <div data-testid="performance-cycle-badge-slot">
              <CycleStatusBadgeLoader month={cycleMonth} />
            </div>
            <ProjectContextSwitcher
              capacities={capacities}
              resolved={resolved}
              onSelect={setCapacity}
            />
          </div>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </PerformanceScopeProvider>
  );
}

/** Stub body for sections not yet built (later stories). Cycle badge lives in the shell only. */
export function PerformanceSectionStub({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Text color="secondary" data-testid="performance-section-stub">
        {title} — coming in a later story.
      </Text>
    </div>
  );
}
