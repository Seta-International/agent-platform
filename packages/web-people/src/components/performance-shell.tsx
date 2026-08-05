import {
  BreadcrumbItem,
  Breadcrumbs,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  SegmentedControl,
  SegmentedControlItem,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect, useMemo } from 'react';
import type { PerformanceCapacity } from '../api/people-client.ts';
import { usePerformanceScope } from '../hooks/use-performance-scope.ts';
import { amTopTabs, isPerformancePathAllowed } from '../nav/performance-nav.ts';
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
 * Performance chrome: page header (title + capacity switcher + cycle badge) and
 * AM top tabs (Reviews | Configuration). No secondary sidebar.
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

  const tabs = amTopTabs(resolved.capacity);
  const activeTab = navIdFromPath(pathname);
  const linkSearch = useMemo(() => ({ ...urlSearch, ...search }), [urlSearch, search]);
  const cycleMonth = resolved.month;

  useEffect(() => {
    // Pathname updates before this route unmounts when leaving Performance.
    // Only enforce access on Performance URLs — never redirect away-navigation to /403.
    const path = pathname.replace(/\/$/, '') || '/';
    if (!path.startsWith('/people/performance')) return;
    // Already on the always-allowed home — nothing to enforce (avoids any loop).
    if (path === '/people/performance') return;
    if (!isPerformancePathAllowed(pathname, role_slugs, resolved.capacity)) {
      // A section that doesn't fit the current capacity (e.g. switching to a
      // non-AM context while on the Configuration tab) is a navigation concern,
      // not a permission error: fall back to the Reviews home, keep the context.
      void navigate({ to: '/people/performance', search: linkSearch, replace: true });
    }
  }, [navigate, pathname, resolved.capacity, role_slugs, linkSearch]);

  return (
    <PerformanceScopeProvider value={{ role_slugs, capacities, resolved, search }}>
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/people">People</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Performance</BreadcrumbItem>
              </Breadcrumbs>
              <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
                <Text as="h1" size="lg" weight="semibold">
                  Performance
                </Text>
                <HStack gap={3} vAlign="center" wrap="wrap">
                  <div data-testid="performance-cycle-badge-slot">
                    <CycleStatusBadgeLoader month={cycleMonth} />
                  </div>
                  <ProjectContextSwitcher
                    capacities={capacities}
                    resolved={resolved}
                    onSelect={setCapacity}
                  />
                </HStack>
              </HStack>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={4} data-testid="performance-workspace">
              {tabs.length > 0 ? (
                // Row wrapper so the control hugs its tabs instead of being
                // stretched to full width by the surrounding VStack.
                <HStack>
                  <SegmentedControl
                    label="Performance section"
                    value={activeTab === 'configuration' ? 'configuration' : 'reviews'}
                    onChange={(value) => {
                      const tab = tabs.find((t) => t.id === value);
                      if (!tab) return;
                      void navigate({ to: tab.to, search: linkSearch });
                    }}
                    data-testid="performance-top-tabs"
                  >
                    {tabs.map((t) => (
                      <SegmentedControlItem key={t.id} value={t.id} label={t.label} />
                    ))}
                  </SegmentedControl>
                </HStack>
              ) : null}
              {children}
            </VStack>
          </LayoutContent>
        }
      />
    </PerformanceScopeProvider>
  );
}

/** Stub body for sections not yet built. */
export function PerformanceSectionStub({ title }: { title: string }) {
  return (
    <VStack gap={2}>
      <Text color="secondary" data-testid="performance-section-stub">
        {title} — coming in a later story.
      </Text>
    </VStack>
  );
}
