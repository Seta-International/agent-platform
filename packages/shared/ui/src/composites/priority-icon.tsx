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
    <span
      role="img"
      aria-label={LABEL[level]}
      className={`priority-icon priority-icon--${level} ${className ?? ''}`.trim()}
    />
  );
}
