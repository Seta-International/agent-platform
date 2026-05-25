import type { TaskPriorityNumber } from '@seta/planner';
import { priorityFromNumber } from '@seta/shared-ui';
import { Flag } from 'lucide-react';

interface Props {
  prio: TaskPriorityNumber;
}

export function PriorityChip({ prio }: Props) {
  const cfg = priorityFromNumber(prio);
  return (
    <span
      className="inline-flex items-center gap-1.5 h-5 px-2 text-[11.5px] rounded-full font-medium justify-self-start"
      style={{ background: cfg.tint, color: cfg.color }}
    >
      <Flag size={10} stroke={cfg.color} />
      {cfg.label}
    </span>
  );
}
