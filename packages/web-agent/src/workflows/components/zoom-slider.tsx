import { Button, Divider, IconButton } from '@seta/shared-ui';
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
      <IconButton
        type="button"
        variant="ghost"
        size="sm"
        label="Zoom out"
        icon={<span aria-hidden>−</span>}
        onClick={() => zoomOut()}
      />
      <span className="w-10 text-center font-mono text-xs tabular-nums text-[var(--color-ink-muted)]">
        {Math.round(zoom * 100)}%
      </span>
      <IconButton
        type="button"
        variant="ghost"
        size="sm"
        label="Zoom in"
        icon={<span aria-hidden>+</span>}
        onClick={() => zoomIn()}
      />
      <Divider orientation="vertical" style={{ height: 16, marginInline: 2 }} />
      {/* Visible text is "Fit"; label carries the fuller accessible name. */}
      <Button type="button" variant="ghost" size="sm" label="Fit view" onClick={() => fitView()}>
        Fit
      </Button>
    </div>
  );
}
