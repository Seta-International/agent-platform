import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  EmptyState,
  Layout,
  LayoutContent,
  LayoutHeader,
  Spinner,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { PerformanceContext } from '../api/people-client.ts';
import { currentMonth, performanceContextOptions } from '../api/performance-query.ts';

function PerformancePageHeader() {
  return (
    <LayoutHeader hasDivider padding={4}>
      <VStack gap={1}>
        <Breadcrumbs variant="supporting">
          <BreadcrumbItem href="/people">People</BreadcrumbItem>
          <BreadcrumbItem isCurrent>Performance</BreadcrumbItem>
        </Breadcrumbs>
        <Text as="h1" size="lg" weight="semibold">
          Performance
        </Text>
      </VStack>
    </LayoutHeader>
  );
}

function GateFrame({ children }: { children: ReactNode }) {
  return (
    <Layout
      height="fill"
      header={<PerformancePageHeader />}
      content={
        <LayoutContent padding={4}>
          <div className="grid min-h-[60vh] place-items-center">{children}</div>
        </LayoutContent>
      }
    />
  );
}

/**
 * Entry gate for the Performance surface (SCR-01 auth-state family).
 * Resolves identity + roles + capacities once and hands the ok-context to its
 * children. Non-ok states keep the page header; ok mounts PerformanceShell
 * (which owns header + capacity switcher).
 */
export function PerformanceGate({
  children,
}: {
  children: (ctx: Extract<PerformanceContext, { status: 'ok' }>) => ReactNode;
}) {
  const query = useQuery(performanceContextOptions(currentMonth()));

  if (query.isPending) {
    return (
      <GateFrame>
        <Spinner label="Loading your performance workspace" />
      </GateFrame>
    );
  }
  if (query.isError) {
    return (
      <GateFrame>
        <EmptyState
          title="Couldn't load your performance workspace"
          description="Something went wrong while loading your identity and roles."
          actions={<Button label="Retry" onClick={() => void query.refetch()} />}
        />
      </GateFrame>
    );
  }
  if (query.data.status === 'no_employee_record') {
    return (
      <GateFrame>
        <EmptyState
          title="No employee record found"
          description="Your account isn't linked to an employee profile yet. Please contact HR to get set up."
        />
      </GateFrame>
    );
  }
  return <>{children(query.data)}</>;
}
