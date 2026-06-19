import { EmptyState, PageChrome } from '@seta/shared-ui';
import { Box } from 'lucide-react';

export function PeoplePage() {
  return (
    <PageChrome title="People">
      <EmptyState
        icon={<Box className="size-6" />}
        title="No People data yet"
        description="This module is scaffolded. Add a domain function and a list screen to fill this page."
      />
    </PageChrome>
  );
}
