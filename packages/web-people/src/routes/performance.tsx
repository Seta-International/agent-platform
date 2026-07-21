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
import { createFileRoute } from '@tanstack/react-router';
import { PerformanceGate } from '../components/performance-gate.tsx';

function PerformancePage() {
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
              // SCR-02 (Story 1.4 role router + Story 1.2 capacity switcher) mounts here.
              <div className="p-6">
                <Text color="secondary">
                  Signed in with {ctx.capacities.length}{' '}
                  {ctx.capacities.length === 1 ? 'capacity' : 'capacities'} for {ctx.as_of_month}.
                </Text>
              </div>
            )}
          </PerformanceGate>
        </LayoutContent>
      }
    />
  );
}

export const Route = createFileRoute('/_authed/people/performance')({
  component: PerformancePage,
});
