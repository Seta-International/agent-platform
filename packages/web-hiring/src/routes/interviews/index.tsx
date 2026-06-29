import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function InterviewsPlaceholder() {
  return (
    <PageChrome title="Interviews">
      <div className="p-6">
        <ComingSoon feature="Interviews" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/hiring/interviews/')({
  component: InterviewsPlaceholder,
});
