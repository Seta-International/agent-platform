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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div
        data-testid="progress-bar-track"
        style={{
          flex: 1,
          height: 4,
          background: 'var(--color-surface-2)',
          borderRadius: 999,
          overflow: 'hidden',
          minWidth: 32,
        }}
      >
        <div
          data-testid="progress-bar-fill"
          style={{ width: `${pct}%`, height: '100%', background: fill }}
        />
      </div>
      <span className="mono t-xs subtle" style={{ width: 28, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  );
}
