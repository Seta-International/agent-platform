import { Text } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';
import { SectionGuard, usePerformanceScope } from '../../components/performance-scope.tsx';

function ConfigurationSection() {
  const { scope } = usePerformanceScope();
  return (
    <SectionGuard section="configuration">
      {/* Later stories replace this placeholder with the real section. */}
      <div className="p-6">
        <Text color="secondary">
          Configuration — scope {scope ? `${scope.capacity.kind} · ${scope.as_of_month}` : 'none'}.
        </Text>
      </div>
    </SectionGuard>
  );
}

export const Route = createFileRoute('/_authed/people/performance/configuration')({
  component: ConfigurationSection,
});
