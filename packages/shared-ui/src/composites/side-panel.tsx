import type * as React from 'react';
import { cn } from '../lib/cn';

export interface SidePanelProps {
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SidePanel({ header, children, className }: SidePanelProps) {
  return (
    <aside className={cn('flex h-full flex-col border-r border-border bg-card', className)}>
      {header && (
        <div className="flex items-center justify-between border-b border-border px-md py-sm text-base">
          {header}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <div className="p-md">{children}</div>
      </div>
    </aside>
  );
}
