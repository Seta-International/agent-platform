import { Button } from '@seta/shared-ui';
import { useState } from 'react';
import { useWorkflowRuns } from '../hooks/use-workflow-runs.ts';
import type { WorkflowRunScope } from '../state/query-keys.ts';
import { RunsInboxRow } from './runs-inbox-row.tsx';

export interface RunsInboxProps {
  definitionId?: string | null;
}

export function RunsInbox({ definitionId = null }: RunsInboxProps) {
  const [scope, setScope] = useState<WorkflowRunScope>('self');
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useWorkflowRuns({ scope, workflowId: definitionId });

  const rows = data?.pages.flatMap((p) => p.rows) ?? [];
  const totalLoaded = rows.length;

  return (
    <section className="flex h-full flex-col">
      <header className="flex h-11 flex-none items-center justify-between border-b border-hairline px-4 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
        <span>Runs</span>
        <label className="inline-flex items-center gap-1.5 text-xs font-normal normal-case tracking-normal text-ink-subtle">
          Show
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as WorkflowRunScope)}
            className="h-7 rounded-md border border-hairline bg-canvas px-2 text-xs"
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
                className="h-12 animate-pulse border-b border-hairline-tertiary bg-surface-2"
              />
            ))
          : null}
        {isError ? (
          <div className="p-4 text-sm">
            <span className="text-destructive">Couldn&apos;t load runs.</span>{' '}
            <button
              type="button"
              onClick={() => refetch()}
              className="font-medium text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : null}
        {!isLoading && data && rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-ink-subtle">
            {definitionId
              ? 'Nothing has run here yet.'
              : 'Nothing has run yet. Create a task to kick one off.'}
          </div>
        ) : null}
        {rows.map((row) => (
          <RunsInboxRow key={row.runId} row={row} />
        ))}
      </div>
      {data && rows.length > 0 ? (
        <footer className="flex h-11 flex-none items-center justify-between border-t border-hairline bg-canvas px-4 text-xs text-ink-muted">
          <span>
            {totalLoaded} {totalLoaded === 1 ? 'run' : 'runs'} loaded
          </span>
          {hasNextPage ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : (
            <span className="text-ink-subtle">No more runs</span>
          )}
        </footer>
      ) : null}
    </section>
  );
}
