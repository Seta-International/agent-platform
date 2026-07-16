import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { DisabledActionTooltip } from './disabled-action-tooltip';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  /** Explanation shown on hover/focus when `disabled` is true. */
  disabledReason?: ReactNode;
}

interface Props<T extends string> {
  value: T;
  onValueChange: (next: T) => void;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  size?: 'sm' | 'md';
  'aria-label'?: string;
  /** Names the control from a visible label element (e.g. a Field group label). */
  'aria-labelledby'?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = 'sm',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className="inline-flex items-center gap-0.5 rounded-md border border-hairline bg-surface-1 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        const button = (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            onClick={() => {
              if (!active && !option.disabled) {
                onValueChange(option.value);
              }
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded transition-colors',
              size === 'md' ? 'px-3 py-1.5 text-sm font-medium' : 'px-2 py-1 text-xs font-medium',
              option.disabled
                ? 'text-ink-subtle/60'
                : active
                  ? 'bg-surface-3 text-ink shadow-sm'
                  : 'text-ink-subtle hover:text-ink hover:bg-surface-2',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
        return option.disabled && option.disabledReason ? (
          <DisabledActionTooltip key={option.value} disabled reason={option.disabledReason}>
            {button}
          </DisabledActionTooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
