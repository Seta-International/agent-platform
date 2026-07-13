import { ResizeHandle, useResizable } from '@astryxdesign/core/Resizable';
import type * as React from 'react';
import { cn } from '../lib/cn';

export interface AgentPanelProps {
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
const RESIZE_STEP = 8;
const RESIZE_STEP_LARGE = 32;

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
  const panel = useResizable({
    defaultSize: defaultWidth,
    minSizePx: minWidth,
    maxSizePx: maxWidth,
    autoSaveId: storageKey ?? undefined,
  });

  // Astryx's ResizeHandle wires its own keyboard handler to a non-focusable
  // inner hit-area div, not the focusable role="separator" element that
  // receives keyboard focus — arrow keys never reach it. Wired here directly
  // via useResizable's own resize() API as a workaround (confirmed against
  // @astryxdesign/core@0.1.4's compiled source).
  function handleResizeKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      panel.resize(panel.size + step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      panel.resize(panel.size - step);
    }
  }

  return (
    <aside
      aria-label="Agent"
      style={{ width: panel.size }}
      className={cn(
        'relative flex h-full flex-none flex-col border-l border-hairline bg-canvas',
        className,
      )}
    >
      <ResizeHandle
        resizable={panel.props}
        direction="horizontal"
        isReversed
        position="overlay"
        label="Resize agent panel"
        onKeyDown={handleResizeKeyDown}
      />
      {children}
    </aside>
  );
}
