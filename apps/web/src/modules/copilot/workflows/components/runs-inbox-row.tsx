import { cn } from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import type { WorkflowRunRow } from '../api/schemas.ts';
import { relativeTime } from '../lib/relative-time.ts';
import { RunStatusPill } from './run-status-pill.tsx';

function shortName(workflowId: string): string {
  return workflowId.replace(/^.*\./, '');
}

function rowLabel(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (typeof o.taskTitle === 'string') return o.taskTitle;
  if (typeof o.title === 'string') return o.title;
  const taskRef = o.taskRef as Record<string, unknown> | undefined;
  if (taskRef && typeof taskRef.taskId === 'string') {
    return `task ${taskRef.taskId.slice(0, 8)}`;
  }
  return null;
}

function formatDuration(ms: number | null): string | null {
  if (ms == null) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function humanizeSupersedeReason(reason: string | null): string {
  if (reason === 'task-assigned-elsewhere') return 'assigned elsewhere';
  return reason ?? 'previously closed';
}

export function RunsInboxRow({ row }: { row: WorkflowRunRow }) {
  const label = rowLabel(row.inputSummary);
  const duration = formatDuration(row.durationMs);
  const runIdShort = row.runId.slice(0, 8);
  const isSuperseded = row.latestApprovalKind === 'superseded';
  return (
    <Link
      to="/copilot/workflows/runs/$runId"
      params={{ runId: row.runId }}
      data-testid="runs-inbox-row"
      data-decision-kind={row.latestApprovalKind ?? undefined}
      className={cn(
        'flex items-center gap-3 border-b border-[var(--color-hairline-tertiary)] px-4 py-2.5 text-sm hover:bg-[var(--color-surface-2)]',
        isSuperseded && 'opacity-60',
      )}
    >
      <RunStatusPill status={row.status} />
      <span className="flex flex-1 min-w-0 flex-col">
        <span className="truncate">
          <span className="font-medium">{shortName(row.workflowId)}</span>
          {label ? <span className="ml-2 text-[var(--color-ink-subtle)]">{label}</span> : null}
        </span>
        <span className="font-mono text-xs text-[var(--color-ink-subtle)]">{runIdShort}</span>
      </span>
      {isSuperseded ? (
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-subtle)]">
          Superseded — {humanizeSupersedeReason(row.latestApprovalReason)}
        </span>
      ) : row.status === 'paused' ? (
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-warning-ink)]">
          HITL
        </span>
      ) : null}
      {duration ? (
        <span className="font-mono text-xs tabular-nums text-[var(--color-ink-subtle)]">
          {duration}
        </span>
      ) : null}
      <span className="w-16 text-right text-xs tabular-nums text-[var(--color-ink-subtle)]">
        {relativeTime(row.startedAt)}
      </span>
    </Link>
  );
}
