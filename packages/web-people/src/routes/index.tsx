import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function DashboardPlaceholder() {
  return (
    <PageChrome title="Dashboard">
      <div className="p-6">
        <ComingSoon feature="Workforce Overview" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/people/')({
  component: DashboardPlaceholder,
});
