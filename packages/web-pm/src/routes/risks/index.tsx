import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function RisksPlaceholder() {
  return (
    <PageChrome title="Risks & Issues">
      <div className="p-6">
        <ComingSoon feature="Risks & Issues" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/pm/risks/')({
  component: RisksPlaceholder,
});
