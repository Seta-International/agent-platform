import { StatusDot } from '@astryxdesign/core/StatusDot';

type Level = 'urgent' | 'important' | 'medium' | 'low';

export interface PriorityIconProps {
  level: Level;
  className?: string;
}

const LABEL: Record<Level, string> = {
  urgent: 'Urgent priority',
  important: 'Important priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

export function PriorityIcon({ level, className }: PriorityIconProps) {
  return (
    <StatusDot
      variant="neutral"
      label={LABEL[level]}
      className={className}
      style={{ backgroundColor: `var(--color-priority-${level})` }}
    />
  );
}
