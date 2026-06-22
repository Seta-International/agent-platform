import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function RaMonitoringPlaceholder() {
  return (
    <PageChrome title="RA Monitoring">
      <div className="p-6">
        <ComingSoon feature="RA Monitoring" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/pm/resourcing/')({
  component: RaMonitoringPlaceholder,
});
