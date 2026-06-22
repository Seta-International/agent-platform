import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function WeeklyReportsPlaceholder() {
  return (
    <PageChrome title="Weekly Reports">
      <div className="p-6">
        <ComingSoon feature="Weekly Reports" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/pm/weekly/')({
  component: WeeklyReportsPlaceholder,
});
