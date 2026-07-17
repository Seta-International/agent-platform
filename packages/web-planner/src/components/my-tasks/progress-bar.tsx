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
    <SharedProgressBar
      value={pct}
      max={100}
      label="Task progress"
      isLabelHidden
      hasValueLabel
      formatValueLabel={(v) => `${v}%`}
      variant={variant}
    />
  );
}
