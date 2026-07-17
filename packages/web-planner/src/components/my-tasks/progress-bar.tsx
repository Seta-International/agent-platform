import { ProgressBar as SharedProgressBar } from '@seta/shared-ui';
import type { DerivedTaskStatus } from '../../lib/derive-task-status';

interface Props {
  pct: number;
  status: DerivedTaskStatus;
}

export function ProgressBar({ pct, status }: Props) {
  const isDone = status === 'Done' || pct === 100;
  const isNot = status === 'Not started' || pct === 0;
  const variant = isDone ? 'success' : isNot ? 'neutral' : 'accent';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 min-w-[32px]">
        <SharedProgressBar
          value={pct}
          max={100}
          label="Task progress"
          isLabelHidden
          variant={variant}
        />
      </div>
      <span className="font-mono text-xs text-secondary w-7 text-right">{pct}%</span>
    </div>
  );
}
