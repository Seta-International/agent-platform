import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function PerformancePlaceholder() {
  return (
    <PageChrome title="Performance">
      <div className="p-6">
        <ComingSoon feature="Performance" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/people/performance')({
  component: PerformancePlaceholder,
});
