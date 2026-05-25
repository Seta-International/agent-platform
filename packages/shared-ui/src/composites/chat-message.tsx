import type * as React from 'react';
import { cn } from '../lib/cn';

export interface ChatMessageProps {
  variant: 'user' | 'agent';
  author?: string;
  timestamp?: Date;
  dim?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatMessage({
  variant,
  author,
  timestamp,
  dim,
  className,
  children,
}: ChatMessageProps) {
  if (variant === 'user') {
    return (
      <div data-variant="user" className={cn('flex justify-end', className)}>
        <div className="max-w-message-bubble rounded-2xl rounded-tr-md bg-surface-2 px-3.5 py-2 text-body-sm text-ink">
          {children}
        </div>
      </div>
    );
  }
  const clock = timestamp ? formatClock(timestamp) : null;
  return (
    <div
      data-variant="agent"
      className={cn(
        'relative pl-3.5 before:pointer-events-none before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:rounded-full before:bg-primary',
        dim && 'opacity-70',
        className,
      )}
    >
      {(author || clock) && (
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
          {author && <span>{author}</span>}
          {author && clock && <span aria-hidden> · </span>}
          {clock && <span>{clock}</span>}
        </div>
      )}
      <div className="text-body-sm text-ink [&_p]:my-0">{children}</div>
    </div>
  );
}
