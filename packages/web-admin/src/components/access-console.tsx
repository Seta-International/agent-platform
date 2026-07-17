import { cn } from '@seta/shared-ui';
import type * as React from 'react';

/**
 * Shared building blocks for the Access-control consoles (Groups, Role access)
 * so the two screens stay visually consistent: a left master rail + a detail
 * pane with a header summarised by stat chips.
 */

/**
 * Groups a row of {@link StatChip}s into a single divided readout so the summary
 * reads as one metric strip rather than a row of look-alike buttons.
 */
export function StatBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-stretch divide-x divide-border overflow-hidden rounded-lg border border-border bg-card">
      {children}
    </div>
  );
}

export function StatChip({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5">
      <span className="text-disabled">{icon}</span>
      <span className="text-card-title font-semibold leading-none tabular-nums text-primary">
        {value}
      </span>
      <span className="text-caption uppercase tracking-[0.04em] text-disabled">{label}</span>
    </div>
  );
}

export function RailHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-3 py-2 text-eyebrow uppercase tracking-[0.04em] text-secondary">
      {children}
    </div>
  );
}

export interface RailItemProps {
  title: string;
  active: boolean;
  onClick: () => void;
  /** Trailing pill at the top-right (e.g. member or role count). */
  count?: React.ReactNode;
  /** Secondary line under the title (badges, hints). */
  subtitle?: React.ReactNode;
}

export function RailItem({ title, active, onClick, count, subtitle }: RailItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group relative w-full rounded-md px-3 py-2 text-left transition-colors',
        active ? 'bg-surface' : 'hover:bg-surface',
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded bg-accent-bg"
          aria-hidden
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-body-sm font-medium text-primary">{title}</span>
        {count != null && (
          <span className="inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-card px-1.5 text-caption tabular-nums text-secondary">
            {count}
          </span>
        )}
      </div>
      {subtitle != null && (
        <div className="mt-1 flex items-center gap-1.5 text-caption text-disabled">{subtitle}</div>
      )}
    </button>
  );
}
