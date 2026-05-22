export interface ProgressBarProps {
  value: number;
  total: number;
  label?: string;
  className?: string;
}

export function ProgressBar({ value, total, label = 'Progress', className }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
      className={`progress-bar ${className ?? ''}`.trim()}
    >
      <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
