import { Text } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';
import { SectionGuard, usePerformanceScope } from '../../components/performance-scope.tsx';

function SelfAssessmentSection() {
  const { scope } = usePerformanceScope();
  return (
    <SectionGuard section="self-assessment">
      {/* Later stories replace this placeholder with the real section. */}
      <div className="p-6">
        <Text color="secondary">
          SelfAssessment — scope {scope ? `${scope.capacity.kind} · ${scope.as_of_month}` : 'none'}.
        </Text>
      </div>
    </SectionGuard>
  );
}

export const Route = createFileRoute('/_authed/people/performance/self-assessment')({
  component: SelfAssessmentSection,
});
