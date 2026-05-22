import { useReactFlow } from '@xyflow/react';
import { useEffect, useState } from 'react';

export function ZoomSlider() {
  const { zoomIn, zoomOut, fitView, getZoom } = useReactFlow();
  const [zoom, setZoom] = useState(() => getZoom());

  useEffect(() => {
    const id = setInterval(() => setZoom(getZoom()), 200);
    return () => clearInterval(id);
  }, [getZoom]);

  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-1 py-0.5 shadow-sm">
      <button
        type="button"
        aria-label="Zoom out"
        className="grid h-7 w-7 place-items-center rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)]"
        onClick={() => zoomOut()}
      >
        −
      </button>
      <span className="w-10 text-center font-mono text-xs tabular-nums text-[var(--color-ink-muted)]">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        aria-label="Zoom in"
        className="grid h-7 w-7 place-items-center rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)]"
        onClick={() => zoomIn()}
      >
        +
      </button>
      <span className="mx-0.5 h-4 w-px bg-[var(--color-hairline)]" />
      <button
        type="button"
        aria-label="Fit view"
        className="grid h-7 place-items-center rounded px-2 text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)]"
        onClick={() => fitView()}
      >
        Fit
      </button>
    </div>
  );
}
