import { cn } from '../lib/cn';
import { formatRelative } from '../lib/format-relative';

export type SyncState = 'idle' | 'pulling' | 'error' | 'conflict';

interface Props {
  state: SyncState | null;
  synced_at: string | null;
  className?: string;
}

interface StateConfig {
  text: (synced_at: string | null) => string;
  bg: string;
  color: string;
}

const CONFIG: Record<SyncState, StateConfig> = {
  idle: {
    text: (synced_at) => {
      if (!synced_at) return 'Synced';
      const rel = formatRelative(synced_at);
      return rel ? `Synced ${rel}` : 'Synced';
    },
    bg: 'var(--color-success-tint)',
    color: 'var(--color-success-ink)',
  },
  pulling: {
    text: () => 'Pulling…',
    bg: 'var(--color-info-tint)',
    color: 'var(--color-info-ink)',
  },
  error: {
    text: () => 'Sync failed',
    bg: 'var(--color-danger-tint)',
    color: 'var(--color-danger-ink)',
  },
  conflict: {
    text: () => 'Conflict',
    bg: 'var(--color-danger-tint)',
    color: 'var(--color-danger-ink)',
  },
};

export function SyncBadge({ state, synced_at, className }: Props) {
  if (state === null) return null;

  const { text, bg, color } = CONFIG[state];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ background: bg, color }}
    >
      {text(synced_at)}
    </span>
  );
}
