import { Link } from '@tanstack/react-router';
import type { WorkflowRunRow } from '../api/schemas.ts';
import { relativeTime } from '../lib/relative-time.ts';
import { RunStatusPill } from './run-status-pill.tsx';

function shortName(workflowId: string): string {
  return workflowId.replace(/^.*\./, '');
}

function inputLabel(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (typeof o.taskTitle === 'string') return o.taskTitle;
  if (typeof o.title === 'string') return o.title;
  return null;
}

export function RunsInboxRow({ row }: { row: WorkflowRunRow }) {
  const label = inputLabel(row.inputSummary);
  return (
    <Link
      to="/copilot/workflows/runs/$runId"
      params={{ runId: row.runId }}
      className="flex items-center gap-3 border-b border-[var(--color-hairline-tertiary)] px-4 py-2.5 text-sm hover:bg-[var(--color-surface-2)]"
    >
      <RunStatusPill status={row.status} />
      <span className="flex-1 truncate">
        <span className="font-medium">{shortName(row.workflowId)}</span>
        {label ? <span className="ml-2 text-[var(--color-ink-subtle)]">{label}</span> : null}
      </span>
      {row.status === 'paused' ? (
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-warning-ink)]">
          HITL
        </span>
      ) : null}
      <span className="text-xs tabular-nums text-[var(--color-ink-subtle)]">
        {relativeTime(row.startedAt)}
      </span>
    </Link>
  );
}
