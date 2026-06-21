import { ComingSoon, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function KnowledgePlaceholder() {
  return (
    <PageChrome title="Knowledge Base">
      <div className="p-6">
        <ComingSoon feature="Knowledge Base" />
      </div>
    </PageChrome>
  );
}

export const Route = createFileRoute('/_authed/hiring/knowledge/')({
  component: KnowledgePlaceholder,
});
