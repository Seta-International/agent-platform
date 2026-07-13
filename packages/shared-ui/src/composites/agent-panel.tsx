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
      />
      {children}
    </aside>
  );
}
