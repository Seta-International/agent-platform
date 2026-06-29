import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function MetricsPlaceholder() {
  return (
    <PageChrome title="KPI Metrics">
      <div className="p-6">
        <ComingSoon feature="KPI Metrics" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/pm/metrics/')({
  component: MetricsPlaceholder,
});
