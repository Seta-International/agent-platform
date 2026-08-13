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
    <PerformanceGate>
      {(ctx) => (
        <PerformanceShell
          role_slugs={ctx.role_slugs}
          capacities={ctx.capacities}
          default_capacity_index={ctx.default_capacity_index}
          can_view_org={ctx.can_view_org}
          as_of_month={ctx.as_of_month}
        >
          <Outlet />
        </PerformanceShell>
      )}
    </PerformanceGate>
  );
}
