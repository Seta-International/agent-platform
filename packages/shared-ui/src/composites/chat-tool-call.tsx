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
  running: 'bg-primary',
  ok: 'bg-semantic-success',
  error: 'bg-destructive',
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
  return (
    <div className={cn('my-xs flex flex-col gap-xxs', className)} data-status={status}>
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        className={cn(
          'inline-flex w-fit max-w-full items-center gap-2.5 whitespace-nowrap rounded-md border border-hairline bg-surface-2 px-2.5 py-1 text-caption text-ink-muted',
          expandable && 'cursor-pointer hover:bg-surface-3',
        )}
      >
        <span
          className={cn('inline-block size-1.5 shrink-0 rounded-full', STATUS_DOT[status])}
          aria-hidden
        />
        <span className="shrink-0 font-mono text-caption text-ink">{name}</span>
        {summary && (
          <>
            <span className="text-ink-subtle" aria-hidden>
              ·
            </span>
            <span className="truncate">{summary}</span>
          </>
        )}
        {duration && (
          <>
            <span className="text-ink-subtle" aria-hidden>
              ·
            </span>
            <span className="shrink-0 font-mono">{duration}</span>
          </>
        )}
        {expandable && (
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-ink-subtle transition-transform',
              open && 'rotate-90',
            )}
            aria-hidden
          />
        )}
      </button>
      {open && payload != null && (
        <pre className="max-w-md overflow-auto rounded-md border border-hairline-tertiary bg-surface-1 p-2 text-caption">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
