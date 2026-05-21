import { Sparkles, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';
import { KbdHint } from './kbd-hint';

export interface CopilotPanelProps {
  onClose?: () => void;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string | null;
  className?: string;
  children?: React.ReactNode;
}

const DEFAULT_WIDTH = 360;
const DEFAULT_MIN = 300;
const DEFAULT_MAX = 720;

function readStoredWidth(key: string | null | undefined, fallback: number): number {
  if (!key || typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function CopilotPanel({
  onClose,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = DEFAULT_MIN,
  maxWidth = DEFAULT_MAX,
  storageKey = 'seta-copilot-panel-width',
  className,
  children,
}: CopilotPanelProps) {
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
      aria-label="Copilot"
      style={{ width }}
      className={cn(
        'relative flex h-full flex-none flex-col border-l border-hairline bg-surface-1',
        className,
      )}
    >
      <div
        role="slider"
        aria-orientation="vertical"
        aria-label="Resize copilot panel"
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

      <header className="flex h-12 flex-none items-center justify-between border-b border-hairline px-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-5 items-center justify-center rounded-md bg-primary-tint text-primary">
            <Sparkles className="size-3" aria-hidden />
          </span>
          <span className="text-body-sm font-semibold text-ink">Copilot</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdHint keys={['⌘\\']} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close copilot panel"
            title="Close"
            className="inline-flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </header>

      {children ?? <CopilotPlaceholder />}
    </aside>
  );
}

function CopilotPlaceholder() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 inline-flex size-9 items-center justify-center rounded-full bg-primary-tint text-primary">
          <Sparkles className="size-4" aria-hidden />
        </div>
        <h2 className="text-body-sm font-semibold text-ink">Copilot is on its way</h2>
        <p className="mt-1.5 max-w-xs text-caption leading-[1.5] text-ink-muted">
          Chat, workflow runs, and HITL approvals will live here. Read tools run inline; writes
          always pause for your confirmation.
        </p>
      </div>

      <div className="flex-none border-t border-hairline p-3">
        <div className="flex h-9 items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-3 text-caption text-ink-tertiary">
          <Sparkles className="size-3.5 text-ink-tertiary" aria-hidden />
          <span>Ask copilot…</span>
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}
