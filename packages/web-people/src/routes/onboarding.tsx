import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function OnboardingPlaceholder() {
  return (
    <PageChrome title="Onboarding">
      <div className="p-6">
        <ComingSoon feature="Onboarding" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/people/onboarding')({
  component: OnboardingPlaceholder,
});
