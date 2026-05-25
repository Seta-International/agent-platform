import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

export interface ChatToolCallProps {
  name: string;
  status: 'running' | 'ok' | 'error';
  summary?: string;
  duration?: string;
  payload?: unknown;
  className?: string;
}

const STATUS_DOT: Record<ChatToolCallProps['status'], string> = {
  running: 'bg-primary animate-pulse',
  ok: 'bg-semantic-success',
  error: 'bg-destructive',
};

const STATUS_LABEL: Record<ChatToolCallProps['status'], string | null> = {
  running: 'running…',
  ok: null,
  error: 'failed',
};

export function ChatToolCall({
  name,
  status,
  summary,
  duration,
  payload,
  className,
}: ChatToolCallProps) {
  const [open, setOpen] = React.useState(false);
  const expandable = payload != null;
  // Prefer the call's own summary on every status — the status dot already
  // tells the user "ok / failed / running"; the summary is the substantive
  // explanation. Fall back to the generic label when no summary is supplied.
  const trailing = summary ?? STATUS_LABEL[status];
  return (
    <div
      className={cn('my-1 flex flex-col gap-1 first:mt-0 last:mb-0', className)}
      data-status={status}
    >
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        className={cn(
          'group inline-flex w-fit max-w-full items-center gap-2 whitespace-nowrap rounded-md border border-hairline bg-surface-1 px-2 py-1 text-caption text-ink-muted transition-colors',
          expandable && 'cursor-pointer hover:border-hairline-strong hover:bg-surface-2',
          status === 'error' && 'border-destructive/40',
        )}
      >
        <span
          className={cn('inline-block size-1.5 shrink-0 rounded-full', STATUS_DOT[status])}
          aria-hidden
        />
        <span className="shrink-0 font-mono text-[11px] text-ink">{name}</span>
        {trailing && (
          <>
            <span className="text-ink-tertiary" aria-hidden>
              ·
            </span>
            <span
              className={cn('truncate', status === 'error' ? 'text-destructive' : 'text-ink-muted')}
            >
              {trailing}
            </span>
          </>
        )}
        {duration && status !== 'running' && (
          <>
            <span className="text-ink-tertiary" aria-hidden>
              ·
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink-subtle">{duration}</span>
          </>
        )}
        {expandable && (
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-ink-tertiary transition-transform',
              open && 'rotate-90',
            )}
            aria-hidden
          />
        )}
      </button>
      {open && payload != null && (
        <pre className="max-h-64 max-w-full overflow-auto rounded-md border border-hairline bg-surface-2 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-muted">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
