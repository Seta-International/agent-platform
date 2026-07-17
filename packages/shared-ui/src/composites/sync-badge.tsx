import { StatusDot } from '@astryxdesign/core/StatusDot';
import { formatRelative } from '../lib/format-relative';
import { Badge } from '../primitives/badge';

export type SyncState = 'idle' | 'pulling' | 'pushing' | 'error' | 'conflict';

interface Props {
  state: SyncState | null;
  synced_at: string | null;
  className?: string;
  linkUrl?: string;
  size?: 'default' | 'mini';
}

const TEXT: Record<SyncState, (synced_at: string | null) => string> = {
  idle: (synced_at) => {
    if (!synced_at) return 'Synced';
    const rel = formatRelative(synced_at);
    return rel ? `Synced ${rel}` : 'Synced';
  },
  pulling: () => 'Pulling…',
  pushing: () => 'Pushing…',
  error: () => 'Sync failed',
  conflict: () => 'Conflict',
};

const BADGE_VARIANT = {
  idle: 'success',
  pulling: 'info',
  pushing: 'info',
  error: 'error',
  conflict: 'error',
} as const;

// StatusDot has no 'info' variant — accent is the nearest for in-flight states.
const DOT_VARIANT = {
  idle: 'success',
  pulling: 'accent',
  pushing: 'accent',
  error: 'error',
  conflict: 'error',
} as const;

export function SyncBadge({ state, synced_at, className, linkUrl, size = 'default' }: Props) {
  if (state === null) return null;

  const isLive = state === 'pulling' || state === 'pushing';

  const badge =
    size === 'mini' ? (
      <StatusDot
        variant={DOT_VARIANT[state]}
        label={`Sync ${state}`}
        role="status"
        data-sync-badge-mini="true"
        className={className}
      />
    ) : (
      <Badge
        label={TEXT[state](synced_at)}
        variant={BADGE_VARIANT[state]}
        role={isLive ? 'status' : undefined}
        className={className}
      />
    );

  if (linkUrl) {
    return (
      <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="no-underline">
        {badge}
      </a>
    );
  }

  return badge;
}
