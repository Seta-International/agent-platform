import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function ProbationPlaceholder() {
  return (
    <PageChrome title="Probation">
      <div className="p-6">
        <ComingSoon feature="Probation" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/people/probation')({
  component: ProbationPlaceholder,
});
