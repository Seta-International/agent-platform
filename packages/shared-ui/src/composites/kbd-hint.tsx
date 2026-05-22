import { cn } from '../lib/cn';

export interface KbdHintProps {
  keys: string[];
  className?: string;
}

export function KbdHint({ keys, className }: KbdHintProps) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-caption text-ink-subtle border border-hairline"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
