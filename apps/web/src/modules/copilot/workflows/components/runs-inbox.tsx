import { useState } from 'react';
import { useWorkflowRuns } from '../hooks/use-workflow-runs.ts';
import type { WorkflowRunScope } from '../state/query-keys.ts';
import { RunsInboxRow } from './runs-inbox-row.tsx';

export interface RunsInboxProps {
  definitionId?: string | null;
}

export function RunsInbox({ definitionId = null }: RunsInboxProps) {
  const [scope, setScope] = useState<WorkflowRunScope>('self');
  const { data, isLoading, isError, refetch } = useWorkflowRuns({ scope });
  const rows = definitionId
    ? (data?.rows.filter((r) => r.workflowId === definitionId) ?? [])
    : (data?.rows ?? []);

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-2">
        <h2 className="text-sm font-medium">Runs</h2>
        <label className="text-xs text-[var(--color-ink-subtle)]">
          Show&nbsp;
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as WorkflowRunScope)}
            className="rounded border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2 py-1 text-xs"
          >
            <option value="self">Mine</option>
            <option value="tenant">Everyone</option>
          </select>
        </label>
      </header>
      <div className="flex-1 overflow-auto">
        {isLoading
          ? ['s0', 's1', 's2', 's3', 's4', 's5'].map((k) => (
              <div
                key={k}
                className="h-12 animate-pulse border-b border-[var(--color-hairline-tertiary)] bg-[var(--color-surface-2)]"
              />
            ))
          : null}
        {isError ? (
          <div className="p-4 text-sm">
            <span className="text-[var(--color-danger-ink)]">Couldn&apos;t load runs.</span>{' '}
            <button
              type="button"
              onClick={() => refetch()}
              className="font-medium text-[var(--color-primary)] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : null}
        {!isLoading && data && rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[var(--color-ink-subtle)]">
            {definitionId
              ? 'Nothing has run here yet.'
              : 'Nothing has run yet. Create a task to kick one off.'}
          </div>
        ) : null}
        {rows.map((row) => (
          <RunsInboxRow key={row.runId} row={row} />
        ))}
      </div>
    </section>
  );
}
