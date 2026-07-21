import { Text } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';
import { SectionGuard, usePerformanceScope } from '../../components/performance-scope.tsx';

function ScoringSection() {
  const { scope } = usePerformanceScope();
  return (
    <SectionGuard section="scoring">
      {/* Later stories replace this placeholder with the real section. */}
      <div className="p-6">
        <Text color="secondary">
          Scoring — scope {scope ? `${scope.capacity.kind} · ${scope.as_of_month}` : 'none'}.
        </Text>
      </div>
    </SectionGuard>
  );
}

export const Route = createFileRoute('/_authed/people/performance/scoring')({
  component: ScoringSection,
});
