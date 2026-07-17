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
  const base =
    'h-[30px] rounded-md border border-border bg-card text-secondary hover:border-accent-bg';
  const iconBtn = cn(base, 'grid w-[30px] place-items-center');
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button type="button" aria-label="zoom out" className={iconBtn} onClick={onZoomOut}>
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-[42px] text-center text-caption font-semibold text-secondary">
        {Math.round(zoomPct)}%
      </span>
      <button type="button" aria-label="zoom in" className={iconBtn} onClick={onZoomIn}>
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="fit"
        className={cn(
          base,
          'inline-flex w-auto items-center gap-1 whitespace-nowrap px-2.5 text-caption font-semibold',
        )}
        onClick={onFit}
      >
        <Maximize2 className="h-3.5 w-3.5" /> Fit
      </button>
    </div>
  );
}
