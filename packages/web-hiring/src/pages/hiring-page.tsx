import { EmptyState, PageChrome } from '@seta/shared-ui';
import { Briefcase } from 'lucide-react';

export function HiringPage() {
  return (
    <PageChrome title="Hiring">
      <EmptyState
        icon={<Briefcase className="size-6" />}
        title="Hiring — coming soon"
        description="Open roles and candidate pipeline will appear here."
      />
    </PageChrome>
  );
}
