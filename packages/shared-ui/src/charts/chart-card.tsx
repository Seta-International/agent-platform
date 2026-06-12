import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ChartCardProps {
  title: string;
  /** Optional element rendered on the right of the header (e.g. a control). */
  action?: ReactNode;
  /** Forwarded to the card root for testing. */
  testId?: string;
  className?: string;
  children: ReactNode;
}

/** Generic carded container for a single chart. Reusable across any chart. */
export function ChartCard({ title, action, testId, className, children }: ChartCardProps) {
  return (
    <section
      data-testid={testId}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-hairline bg-canvas p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-body-sm font-medium text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
