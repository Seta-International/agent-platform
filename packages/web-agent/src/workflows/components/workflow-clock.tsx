import { useEffect, useState } from 'react';

const TERMINAL = new Set(['success', 'failed', 'tripwire', 'canceled']);

export interface WorkflowClockProps {
  startedAt: Date;
  finishedAt?: Date | null;
  status: string;
  className?: string;
}

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  return `${m}m ${s.toFixed(1)}s`;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

export function WorkflowClock({ startedAt, finishedAt, status, className }: WorkflowClockProps) {
  const terminal = TERMINAL.has(status);
  const reduced = prefersReducedMotion();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (terminal || reduced) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [terminal, reduced]);

  const endMs = terminal && finishedAt ? finishedAt.getTime() : now;
  const elapsed = Math.max(0, endMs - startedAt.getTime());

  return (
    <span
      className={`font-mono text-xs tabular-nums text-[var(--color-ink-muted)] ${className ?? ''}`}
    >
      {formatMs(elapsed)}
    </span>
  );
}
