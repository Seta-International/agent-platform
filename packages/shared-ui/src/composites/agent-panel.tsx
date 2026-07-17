import { useResizable } from '@astryxdesign/core/Resizable';
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { cn } from '../lib/cn';

export interface AgentPanelProps {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string | null;
  className?: string;
  children?: ReactNode;
}

const DEFAULT_WIDTH = 380;
const DEFAULT_MIN = 320;
const DEFAULT_MAX = 720;
const STEP = 8;
const STEP_LARGE = 32;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

function readStored(key: string | null | undefined, fallback: number, min: number, max: number) {
  if (!key || typeof window === 'undefined') return fallback;
  const n = Number.parseInt(window.localStorage.getItem(key) ?? '', 10);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

/**
 * Resizable docked container for the Ask Seta agent panel. `useResizable` holds the
 * size + clamping; we own the pointer grip and persistence because Astryx's overlay
 * ResizeHandle pins its hit area to the panel's inline-end (right) edge — unreachable
 * for this right-docked panel, whose grip must sit on the left — and we persist width
 * ourselves under the bare `storageKey` rather than Astryx's `astryx-resizable:` prefix.
 * Children own their header, conversation, and composer and fill the column via flex.
 */
export function AgentPanel({
  defaultWidth = DEFAULT_WIDTH,
  minWidth = DEFAULT_MIN,
  maxWidth = DEFAULT_MAX,
  storageKey = 'seta-agent-panel-width',
  className,
  children,
}: AgentPanelProps) {
  const panel = useResizable({
    defaultSize: readStored(storageKey, defaultWidth, minWidth, maxWidth),
    minSizePx: minWidth,
    maxSizePx: maxWidth,
  });

  // Latest panel in a ref so the window drag listeners never re-subscribe mid-gesture.
  const panelRef = useRef(panel);
  panelRef.current = panel;

  const persist = useCallback(
    (w: number) => {
      if (storageKey && typeof window !== 'undefined')
        window.localStorage.setItem(storageKey, String(Math.round(w)));
    },
    [storageKey],
  );

  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: panelRef.current.size };
  };

  useEffect(() => {
    const onMove = (e: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      // Panel docked on the right: dragging left (clientX decreases) widens it.
      panelRef.current.resize(clamp(d.startWidth + (d.startX - e.clientX), minWidth, maxWidth));
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      persist(panelRef.current.size);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [minWidth, maxWidth, persist]);

  const nudge = (delta: number) => {
    const next = clamp(panelRef.current.size + delta, minWidth, maxWidth);
    panelRef.current.resize(next);
    persist(next);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? STEP_LARGE : STEP;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nudge(step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nudge(-step);
    }
  };

  return (
    <aside
      aria-label="Agent"
      style={{ width: panel.size }}
      className={cn(
        'relative flex h-full flex-none flex-col border-l border-border bg-body',
        className,
      )}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: focusable window-splitter (WAI-ARIA separator with tabindex + aria-valuenow + keyboard/pointer resize); <hr> can't be focusable or valued */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={panel.size}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-label="Resize agent panel"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none focus-visible:bg-accent-muted"
      />
      {children}
    </aside>
  );
}
