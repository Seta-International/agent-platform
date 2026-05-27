import * as React from 'react';
import { cn } from '../lib/cn';

export interface AgentPanelProps {
  onClose?: () => void;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string | null;
  className?: string;
  children?: React.ReactNode;
}

const DEFAULT_WIDTH = 380;
const DEFAULT_MIN = 320;
const DEFAULT_MAX = 720;

function readStoredWidth(key: string | null | undefined, fallback: number): number {
  if (!key || typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Resizable docked container for the agent side panel.
 * Renders only the chrome (resize rail + width persistence); children own their header,
 * conversation, and composer so the panel reads as a single designed surface rather than
 * two stacked toolbars.
 */
export function AgentPanel({
  defaultWidth = DEFAULT_WIDTH,
  minWidth = DEFAULT_MIN,
  maxWidth = DEFAULT_MAX,
  storageKey = 'seta-agent-panel-width',
  className,
  children,
}: AgentPanelProps) {
  const [width, setWidth] = React.useState<number>(() =>
    clamp(readStoredWidth(storageKey, defaultWidth), minWidth, maxWidth),
  );
  const dragStartRef = React.useRef<{ startX: number; startWidth: number } | null>(null);

  const persistWidth = React.useCallback(
    (next: number) => {
      if (storageKey && typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, String(next));
      }
    },
    [storageKey],
  );

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const delta = start.startX - e.clientX;
      setWidth(clamp(start.startWidth + delta, minWidth, maxWidth));
    };
    const onUp = () => {
      if (!dragStartRef.current) return;
      dragStartRef.current = null;
      Object.assign(document.body.style, { cursor: '', userSelect: '' });
      setWidth((w) => {
        persistWidth(w);
        return w;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [minWidth, maxWidth, persistWidth]);

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragStartRef.current = { startX: e.clientX, startWidth: width };
    Object.assign(document.body.style, { cursor: 'col-resize', userSelect: 'none' });
  };

  const onResizeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 32 : 8;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setWidth((w) => {
        const next = clamp(w + step, minWidth, maxWidth);
        persistWidth(next);
        return next;
      });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setWidth((w) => {
        const next = clamp(w - step, minWidth, maxWidth);
        persistWidth(next);
        return next;
      });
    }
  };

  return (
    <aside
      aria-label="Agent"
      style={{ width }}
      className={cn(
        'relative flex h-full flex-none flex-col border-l border-hairline bg-canvas',
        className,
      )}
    >
      <div
        role="slider"
        aria-orientation="vertical"
        aria-label="Resize agent panel"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={onResizeKey}
        className="group absolute -left-0.5 top-0 z-10 flex h-full w-1 cursor-col-resize items-center justify-center select-none focus-visible:outline-none"
      >
        <span
          aria-hidden
          className="block h-10 w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-primary-border group-focus-visible:bg-primary"
        />
      </div>
      {children}
    </aside>
  );
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}
