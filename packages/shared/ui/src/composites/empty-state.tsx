import type * as React from 'react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-xl text-center', className)}>
      {icon && <div className="mb-md text-ink-subtle">{icon}</div>}
      <h3 className="text-card-title text-ink">{title}</h3>
      {description && <p className="mt-xs text-body-sm text-ink-subtle">{description}</p>}
      {action && (
        <Button className="mt-md" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
