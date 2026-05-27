import { tokenFor } from '../lib/status-tokens.ts';

export interface RunStatusPillProps {
  status: string;
  className?: string;
}

export function RunStatusPill({ status, className }: RunStatusPillProps) {
  const t = tokenFor(status);
  return (
    <span
      role="status"
      aria-label={`status: ${status}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${className ?? ''}`}
      style={{ background: t.bg, color: t.ink }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: t.dot }} />
      {t.label}
    </span>
  );
}
