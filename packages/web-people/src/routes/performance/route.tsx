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
import { PerformanceGate } from '../../components/performance-gate.tsx';
import { PerformanceShell } from '../../components/performance-shell.tsx';
import { parsePerformanceSearch } from '../../state/performance-scope.ts';

export const Route = createFileRoute('/_authed/people/performance')({
  validateSearch: (s: Record<string, unknown>) => parsePerformanceSearch(s),
  component: PerformanceLayout,
});

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
        <LayoutContent padding={4}>
          <PerformanceGate>
            {(ctx) => (
              <PerformanceShell
                role_slugs={ctx.role_slugs}
                capacities={ctx.capacities}
                default_capacity_index={ctx.default_capacity_index}
                as_of_month={ctx.as_of_month}
              >
                <Outlet />
              </PerformanceShell>
            )}
          </PerformanceGate>
        </LayoutContent>
      }
    />
  );
}
