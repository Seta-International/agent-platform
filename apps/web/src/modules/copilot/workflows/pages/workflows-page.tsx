import { DefinitionsList } from '../components/definitions-list.tsx';
import { RunsInbox } from '../components/runs-inbox.tsx';

export function WorkflowsPage() {
  return (
    <div className="flex h-full">
      <DefinitionsList />
      <main className="flex-1">
        <RunsInbox />
      </main>
    </div>
  );
}
