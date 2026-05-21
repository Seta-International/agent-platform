import { useState } from 'react';
import type { WorkflowRunRow } from '../api/schemas.ts';
import type { WorkflowRunStreamEvent } from '../hooks/use-workflow-run.ts';

type Tab = 'logs' | 'events' | 'input' | 'state';

interface SnapshotShape {
  status?: string;
  context?: Record<string, unknown>;
}

export interface RunRightPanelProps {
  run: WorkflowRunRow;
  streamEvents: WorkflowRunStreamEvent[];
  snapshot?: unknown;
}

export function RunRightPanel({ run, streamEvents, snapshot }: RunRightPanelProps) {
  const [tab, setTab] = useState<Tab>('logs');
  const snap = (snapshot ?? null) as SnapshotShape | null;
  return (
    <aside className="hidden w-[360px] shrink-0 flex-col border-l border-[var(--color-hairline)] lg:flex">
      <nav className="flex border-b border-[var(--color-hairline)] text-xs">
        {(['logs', 'events', 'input', 'state'] as Tab[]).map((t) => (
          <button
            type="button"
            key={t}
            className={
              tab === t
                ? 'border-b-2 border-[var(--color-primary)] px-3 py-2 font-medium capitalize'
                : 'px-3 py-2 capitalize text-[var(--color-ink-subtle)]'
            }
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs">
        {tab === 'input' ? <pre>{JSON.stringify(run.inputSummary, null, 2)}</pre> : null}
        {tab === 'state' ? <pre>{JSON.stringify(snap?.context ?? {}, null, 2)}</pre> : null}
        {tab === 'logs' ? (
          <ul className="space-y-1">
            {streamEvents.length === 0 ? (
              <li className="text-[var(--color-ink-subtle)]">No events yet.</li>
            ) : null}
            {streamEvents.map((e) => (
              <li key={e.seq}>
                <span className="text-[var(--color-ink-subtle)]">[{e.kind}]</span>{' '}
                {JSON.stringify(e.payload)}
              </li>
            ))}
          </ul>
        ) : null}
        {tab === 'events' ? (
          <ul className="space-y-1">
            {streamEvents
              .filter((e) => e.kind.startsWith('run-'))
              .map((e) => (
                <li key={e.seq}>{e.kind}</li>
              ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}
