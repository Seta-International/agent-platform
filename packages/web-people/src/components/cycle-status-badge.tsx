import { Badge, StatusToneDot } from '@seta/shared-ui';
import type { CycleStatus } from '../api/people-client.ts';

/** Product copy — classification stays on the server; FE only maps the flag (FE-AD-12). */
export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  open: 'Open (25th–end of month)',
  makeup: 'Grace window (2nd–4th)',
  locked: 'Locked',
  override: 'Unlocked (Override)',
};

const CYCLE_STATUS_TONE: Record<CycleStatus, 'success' | 'warning' | 'danger' | 'primary'> = {
  open: 'success',
  makeup: 'warning',
  locked: 'danger',
  override: 'primary',
};

const CYCLE_STATUS_BADGE_VARIANT: Record<CycleStatus, 'success' | 'warning' | 'error' | 'info'> = {
  open: 'success',
  makeup: 'warning',
  locked: 'error',
  override: 'info',
};

export type CycleStatusBadgeProps = {
  /** Server-computed flag — never derive from `Date` on the client. */
  status: CycleStatus;
};

/**
 * Echo-only cycle-status badge (FUT-694 / SCR-02).
 * 3-channel a11y: icon (StatusToneDot) + text label + color variant — not color alone.
 */
export function CycleStatusBadge({ status }: CycleStatusBadgeProps) {
  const label = CYCLE_STATUS_LABEL[status];
  return (
    <span
      data-testid="cycle-status-badge"
      className="inline-flex items-center gap-2"
      role="status"
      aria-label={`Cycle status: ${label}`}
    >
      <StatusToneDot tone={CYCLE_STATUS_TONE[status]} label={label} />
      <Badge variant={CYCLE_STATUS_BADGE_VARIANT[status]} label={label} />
    </span>
  );
}
