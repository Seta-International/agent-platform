import { StatusDot, type StatusDotVariant } from '@seta/shared-ui';
import type { DerivedTaskStatus } from '../../lib/derive-task-status';

// Standard status colors (Jira-like): In Progress = blue, Done = green, the rest
// neutral. The theme's `accent` tone is achromatic, so In Progress overrides the
// dot color with an explicit icon-color token.
const STATUS_DOT: Record<DerivedTaskStatus, { variant: StatusDotVariant; color?: string }> = {
  'Not started': { variant: 'neutral' },
  'In Progress': { variant: 'accent', color: 'var(--color-icon-blue)' },
  Done: { variant: 'success' },
  Deferred: { variant: 'neutral' },
};

interface Props {
  status: DerivedTaskStatus;
}

export function StatusInline({ status }: Props) {
  const { variant, color } = STATUS_DOT[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-secondary text-sm">
      <span data-testid="status-inline-dot" data-tone={variant}>
        <StatusDot
          variant={variant}
          label={status}
          aria-hidden="true"
          style={color ? { backgroundColor: color } : undefined}
        />
      </span>
      {status}
    </span>
  );
}
