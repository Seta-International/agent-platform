import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function OrgChartPlaceholder() {
  return (
    <PageChrome title="Org Chart">
      <div className="p-6">
        <ComingSoon feature="Org Chart" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/people/org')({
  component: OrgChartPlaceholder,
});
