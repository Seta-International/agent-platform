import { cn } from '@seta/shared-ui';

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

export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 flex-none items-center justify-center rounded-full bg-surface text-caption font-medium text-secondary',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
