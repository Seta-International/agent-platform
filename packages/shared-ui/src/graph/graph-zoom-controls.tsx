import { Maximize2, Minus, Plus } from 'lucide-react';
import { cn } from '../lib/cn';

export interface GraphZoomControlsProps {
  zoomPct: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  className?: string;
}

export function GraphZoomControls({
  zoomPct,
  onZoomIn,
  onZoomOut,
  onFit,
  className,
}: GraphZoomControlsProps) {
  const btn =
    'grid h-[30px] w-[30px] place-items-center rounded-md border border-hairline bg-surface-1 text-ink-muted hover:border-primary-border';
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button type="button" aria-label="zoom out" className={btn} onClick={onZoomOut}>
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-[42px] text-center text-caption font-semibold text-ink-subtle">
        {Math.round(zoomPct)}%
      </span>
      <button type="button" aria-label="zoom in" className={btn} onClick={onZoomIn}>
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="fit"
        className={cn(btn, 'w-auto gap-1 px-2.5 text-caption font-semibold')}
        onClick={onFit}
      >
        <Maximize2 className="h-3.5 w-3.5" /> Fit
      </button>
    </div>
  );
}
