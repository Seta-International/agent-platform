import { Button, EmptyState, Spinner } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { PerformanceContext } from '../api/people-client.ts';
import { currentMonth, performanceContextOptions } from '../api/performance-query.ts';

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid min-h-[60vh] place-items-center">{children}</div>;
}

/**
 * Entry gate for the Performance surface (SCR-01 auth-state family).
 * Resolves identity + roles + capacities once and hands the ok-context to its
 * children (SCR-02 — Stories 1.2/1.4 — mounts inside). The two non-ok states
 * are deliberate, dedicated screens: a friendly retry on load failure (never
 * an error dump) and a "Contact HR" block for users without an employee
 * record (never the generic /403).
 */
export function PerformanceGate({
  children,
}: {
  children: (ctx: Extract<PerformanceContext, { status: 'ok' }>) => ReactNode;
}) {
  const query = useQuery(performanceContextOptions(currentMonth()));

  if (query.isPending) {
    return (
      <Centered>
        <Spinner label="Loading your performance workspace" />
      </Centered>
    );
  }
  if (query.isError) {
    return (
      <Centered>
        <EmptyState
          title="Couldn't load your performance workspace"
          description="Something went wrong while loading your identity and roles."
          actions={<Button label="Retry" onClick={() => void query.refetch()} />}
        />
      </Centered>
    );
  }
  if (query.data.status === 'no_employee_record') {
    return (
      <Centered>
        <EmptyState
          title="No employee record found"
          description="Your account isn't linked to an employee profile yet. Please contact HR to get set up."
        />
      </Centered>
    );
  }
  return <>{children(query.data)}</>;
}
