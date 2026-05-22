import { Sparkles } from 'lucide-react';
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
        <div className="max-w-message-bubble rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-body-sm shadow-sm">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div data-variant="agent" className={cn('flex gap-2.5', dim && 'opacity-85', className)}>
      <div className="flex size-6 flex-none items-center justify-center rounded-md border border-primary-border bg-primary-tint text-primary">
        <Sparkles className="size-3.5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-body-sm font-semibold">{author ?? 'Copilot'}</span>
          {timestamp && (
            <span className="text-caption text-ink-subtle">
              {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="text-body-sm text-ink">{children}</div>
      </div>
    </div>
  );
}
