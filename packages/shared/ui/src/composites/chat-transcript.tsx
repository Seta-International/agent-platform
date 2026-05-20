import type * as React from 'react';
import { cn } from '../lib/cn';

export interface ChatTranscriptProps {
  dateDividers?: Array<{ label: string }>;
  className?: string;
  children?: React.ReactNode;
}

export function ChatTranscript({ dateDividers, className, children }: ChatTranscriptProps) {
  return (
    <div
      data-testid="chat-transcript"
      className={cn('flex-1 overflow-auto bg-surface-1 py-6', className)}
    >
      <div className="mx-auto flex max-w-conversation flex-col gap-lg px-md">
        {dateDividers?.map((d) => (
          <div key={d.label} className="flex items-center gap-2.5 text-ink-subtle">
            <div className="h-px flex-1 border-t border-hairline" />
            <span className="text-caption">{d.label}</span>
            <div className="h-px flex-1 border-t border-hairline" />
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}
