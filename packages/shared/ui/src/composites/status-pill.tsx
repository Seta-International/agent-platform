import { cn } from '../lib/cn';

export type StatusKind = 'on-track' | 'at-risk' | 'off-track' | 'active' | 'pending' | 'blocked';

interface Props {
  kind: StatusKind;
  className?: string;
}

const CONFIG: Record<StatusKind, { text: string; bg: string; color: string }> = {
  'on-track': {
    text: 'On track',
    bg: 'var(--color-success-tint)',
    color: 'var(--color-success-ink)',
  },
  'at-risk': {
    text: 'At risk',
    bg: 'var(--color-warning-tint)',
    color: 'var(--color-warning-ink)',
  },
  'off-track': {
    text: 'Off track',
    bg: 'var(--color-danger-tint)',
    color: 'var(--color-danger-ink)',
  },
  active: { text: 'Active', bg: 'var(--color-info-tint)', color: 'var(--color-info-ink)' },
  pending: { text: 'Pending', bg: 'var(--color-warning-tint)', color: 'var(--color-warning-ink)' },
  blocked: { text: 'Blocked', bg: 'var(--color-danger-tint)', color: 'var(--color-danger-ink)' },
};

export function StatusPill({ kind, className }: Props) {
  const { text, bg, color } = CONFIG[kind];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ background: bg, color }}
    >
      {text}
    </span>
  );
}
