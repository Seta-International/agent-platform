import { EmptyState, PageChrome } from '@seta/shared-ui';
import { FolderKanban } from 'lucide-react';

export function PmPage() {
  return (
    <PageChrome title="Project Management">
      <EmptyState
        icon={<FolderKanban className="size-6" />}
        title="Project Management — coming soon"
        description="Projects, milestones, and task boards will appear here."
      />
    </PageChrome>
  );
}
