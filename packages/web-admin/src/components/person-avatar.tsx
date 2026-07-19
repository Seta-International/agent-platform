import { cn, Text } from '@seta/shared-ui';

/** Two-letter initials from a display name, e.g. "Jane Doe" → "JD". */
export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function PersonAvatar({
  name,
  size = 'sm',
  className,
}: {
  name: string;
  /** 'sm' (default, e.g. table rows) or 'lg' (e.g. detail-sheet header). */
  size?: 'sm' | 'lg';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex flex-none items-center justify-center',
        size === 'lg' ? 'size-10' : 'size-7',
        className,
      )}
      // keep: solid circular chip — no Avatar/Text prop covers a circular decorative
      // background; sized and colored entirely from tokens (no raw hex/px).
      style={{
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--color-background-surface)',
      }}
    >
      <Text
        type={size === 'lg' ? 'body' : 'supporting'}
        weight={size === 'lg' ? 'semibold' : 'medium'}
        color="secondary"
      >
        {initials(name)}
      </Text>
    </span>
  );
}
