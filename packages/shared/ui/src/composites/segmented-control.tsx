import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
}

interface Props<T extends string> {
  value: T;
  onValueChange: (next: T) => void;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = 'sm',
  'aria-label': ariaLabel,
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-md border border-hairline bg-surface-1 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={option.ariaLabel}
            onClick={() => {
              if (!active) {
                onValueChange(option.value);
              }
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded transition-colors',
              size === 'md' ? 'px-3 py-1.5 text-sm font-medium' : 'px-2 py-1 text-xs font-medium',
              active
                ? 'bg-surface-3 text-ink shadow-sm'
                : 'text-ink-subtle hover:text-ink hover:bg-surface-2',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
