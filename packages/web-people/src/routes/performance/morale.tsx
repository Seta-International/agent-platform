import { Text } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';
import { SectionGuard, usePerformanceScope } from '../../components/performance-scope.tsx';

function MoraleSection() {
  const { scope } = usePerformanceScope();
  return (
    <SectionGuard section="morale">
      {/* Later stories replace this placeholder with the real section. */}
      <div className="p-6">
        <Text color="secondary">
          Morale — scope {scope ? `${scope.capacity.kind} · ${scope.as_of_month}` : 'none'}.
        </Text>
      </div>
    </SectionGuard>
  );
}

export const Route = createFileRoute('/_authed/people/performance/morale')({
  component: MoraleSection,
});
