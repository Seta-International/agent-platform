import type { TaskPriorityNumber } from '@seta/planner';
import { Flag } from 'lucide-react';

const CFG = {
  1: { label: 'Urgent', color: 'var(--color-danger)', tint: 'var(--color-danger-tint)' },
  3: { label: 'Important', color: 'var(--color-warning)', tint: 'var(--color-warning-tint)' },
  5: { label: 'Medium', color: 'var(--color-info)', tint: 'var(--color-info-tint)' },
  9: { label: 'Low', color: 'var(--color-ink-tertiary)', tint: 'var(--color-surface-2)' },
} as const satisfies Record<TaskPriorityNumber, { label: string; color: string; tint: string }>;

const FALLBACK = CFG[5];

interface Props {
  prio: TaskPriorityNumber;
}

export function PriorityChip({ prio }: Props) {
  const cfg = CFG[prio] ?? FALLBACK;
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
