import { Text } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';
import { SectionGuard, usePerformanceScope } from '../../components/performance-scope.tsx';

function DashboardSection() {
  const { scope, context } = usePerformanceScope();
  return (
    <SectionGuard section="dashboard">
      {/* Story 1.3+ replace this placeholder with the real dashboard. */}
      <div className="p-6">
        <Text color="secondary">
          Dashboard — {context.capacities.length}{' '}
          {context.capacities.length === 1 ? 'capacity' : 'capacities'}, scope{' '}
          {scope ? `${scope.capacity.kind} · ${scope.as_of_month}` : 'none'}.
        </Text>
      </div>
    </SectionGuard>
  );
}

export const Route = createFileRoute('/_authed/people/performance/')({
  component: DashboardSection,
});
