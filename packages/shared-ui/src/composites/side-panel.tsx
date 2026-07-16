import type * as React from 'react';
import { cn } from '../lib/cn';

export interface SidePanelProps {
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SidePanel({ header, children, className }: SidePanelProps) {
  return (
    <aside className={cn('flex h-full flex-col border-r border-hairline bg-surface-1', className)}>
      {header && (
        <div className="flex items-center justify-between border-b border-hairline px-md py-sm text-body-sm">
          {header}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <div className="p-md">{children}</div>
      </div>
    </aside>
  );
}
