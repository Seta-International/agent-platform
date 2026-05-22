import type { DerivedTaskStatus } from '../../lib/derive-task-status';

interface Props {
  pct: number;
  status: DerivedTaskStatus;
}

export function ProgressBar({ pct, status }: Props) {
  const isDone = status === 'Done' || pct === 100;
  const isNot = status === 'Not started' || pct === 0;
  const fill = isDone
    ? 'var(--color-success)'
    : isNot
      ? 'var(--color-ink-tertiary)'
      : 'var(--color-primary)';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        data-testid="progress-bar-track"
        className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden min-w-[32px]"
      >
        <div
          data-testid="progress-bar-fill"
          className="h-full"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>
      <span className="font-mono text-[11px] text-ink-subtle w-7 text-right">{pct}%</span>
    </div>
  );
}
