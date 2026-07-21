import {
  BreadcrumbItem,
  Breadcrumbs,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  Text,
  VStack,
} from '@seta/shared-ui';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { PerformanceGate } from '../components/performance-gate.tsx';
import { PerformanceScopeProvider } from '../components/performance-scope.tsx';
import { PerformanceShell } from '../components/performance-shell.tsx';

/** The scope tuple lives here and only here (AC3/AC4 — shareable links). */
export function validatePerformanceSearch(s: Record<string, unknown>) {
  return {
    capacity: typeof s.capacity === 'string' ? s.capacity : undefined,
    month: typeof s.month === 'string' ? s.month : undefined,
  };
}

function PerformanceLayout() {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/people">People</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Performance</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Performance
                </Text>
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <PerformanceGate>
            {(ctx) => (
              <PerformanceScopeProvider context={ctx}>
                <PerformanceShell>
                  <Outlet />
                </PerformanceShell>
              </PerformanceScopeProvider>
            )}
          </PerformanceGate>
        </LayoutContent>
      }
    />
  );
}

export const Route = createFileRoute('/_authed/people/performance')({
  validateSearch: validatePerformanceSearch,
  component: PerformanceLayout,
});
