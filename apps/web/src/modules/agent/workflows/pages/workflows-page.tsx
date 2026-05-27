import { PageChrome } from '@seta/shared-ui';
import { useState } from 'react';
import { DefinitionsList } from '../components/definitions-list.tsx';
import { RunsInbox } from '../components/runs-inbox.tsx';

export function WorkflowsPage() {
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  return (
    <PageChrome
      breadcrumb={['Agent']}
      title="Workflows"
      subtitle="Automations and their recent runs"
    >
      <div className="flex h-full">
        <DefinitionsList selectedId={definitionId} onSelect={setDefinitionId} />
        <main className="flex-1">
          <RunsInbox definitionId={definitionId} />
        </main>
      </div>
    </PageChrome>
  );
}
