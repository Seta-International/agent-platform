import type { DerivedTaskStatus } from '../../lib/derive-task-status';

const TONE: Record<DerivedTaskStatus, 'muted' | 'primary' | 'success'> = {
  'Not started': 'muted',
  'In Progress': 'primary',
  Done: 'success',
  Deferred: 'muted',
};

interface Props {
  status: DerivedTaskStatus;
}

export function StatusInline({ status }: Props) {
  const tone = TONE[status];
  return (
    <span
      data-testid="status-inline"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11.5,
        color: 'var(--color-ink-subtle)',
      }}
    >
      <span data-testid="status-inline-dot" className={`dot dot--${tone}`} />
      {status}
    </span>
  );
}
