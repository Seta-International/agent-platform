import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function ReportsPlaceholder() {
  return (
    <PageChrome title="Reports">
      <div className="p-6">
        <ComingSoon feature="Reports" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/hiring/')({
  component: ReportsPlaceholder,
});
