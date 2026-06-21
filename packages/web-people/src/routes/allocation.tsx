import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function AllocationPlaceholder() {
  return (
    <PageChrome title="Resource Allocation">
      <div className="p-6">
        <ComingSoon feature="Resource Allocation" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/people/allocation')({
  component: AllocationPlaceholder,
});
