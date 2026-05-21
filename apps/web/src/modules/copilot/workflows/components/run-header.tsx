import { Link } from '@tanstack/react-router';
import type { WorkflowRunRow } from '../api/schemas.ts';
import { RunStatusPill } from './run-status-pill.tsx';

const TERMINAL = new Set(['success', 'failed', 'tripwire', 'canceled']);

export interface RunHeaderProps {
  run: WorkflowRunRow;
  onRerun?: () => void;
}

export function RunHeader({ run, onRerun }: RunHeaderProps) {
  const terminal = TERMINAL.has(run.status);
  return (
    <header className="flex items-center gap-3 border-b border-[var(--color-hairline)] px-4 py-2.5">
      <Link
        to="/copilot/workflows"
        className="text-sm text-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]"
      >
        ← Workflows
      </Link>
      <span className="text-[var(--color-ink-subtle)]">/</span>
      <span className="font-mono text-sm">{run.workflowId.replace(/^.*\./, '')}</span>
      <span className="text-[var(--color-ink-subtle)]">·</span>
      <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
        Run {run.runId.slice(0, 7)}
      </span>
      <RunStatusPill status={run.status} />
      <div className="ml-auto flex gap-2">
        {terminal && onRerun ? (
          <button
            type="button"
            onClick={onRerun}
            className="rounded border border-[var(--color-hairline)] px-2 py-1 text-sm hover:bg-[var(--color-surface-2)]"
          >
            Re-run
          </button>
        ) : null}
      </div>
    </header>
  );
}
