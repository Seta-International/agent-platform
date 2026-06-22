import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function OffboardingPlaceholder() {
  return (
    <PageChrome title="Offboarding">
      <div className="p-6">
        <ComingSoon feature="Offboarding" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/people/offboarding')({
  component: OffboardingPlaceholder,
});
