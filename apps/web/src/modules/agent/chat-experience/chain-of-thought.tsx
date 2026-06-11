import { useAuiState } from '@assistant-ui/react';
import { ChatToolCall } from '@seta/shared-ui';
import { type ReactNode, useMemo, useState } from 'react';
import { extractLeafToolCalls, humanizeToolName } from './leaf-tool-calls';
import { useDensity } from './use-density';

export interface ChainOfThoughtProps {
  running: boolean;
  count: number;
  indices: readonly number[];
  children: ReactNode;
}

export function ChainOfThought({ running, count, indices, children }: ChainOfThoughtProps) {
  const { density } = useDensity();
  // null = follow the density default; true/false = an explicit user toggle.
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  // Keep the group expanded while any inner tool-call is awaiting user approval
  // (Mastra-native `requireApproval` HITL gate). Otherwise the agent flipping to
  // 'complete' collapses the group and hides the approval card until the user
  // expands it manually.
  const hasPendingAction = useAuiState((s) => {
    if (!indices.length) return false;
    const content = s.message.content as ReadonlyArray<{ status?: { type?: string } }>;
    return indices.some((i) => content[i]?.status?.type === 'requires-action');
  });
  // Select the stable `content` reference (not a freshly-built array) so useAuiState's
  // equality check doesn't fire every render; derive the rows with useMemo. Returning
  // `extractLeafToolCalls(...)` straight from the selector creates a new array each call,
  // which assistant-ui reads as a perpetual change → "Maximum update depth exceeded".
  const content = useAuiState((s) => s.message.content as ReadonlyArray<unknown>);
  const leafRows = useMemo(() => extractLeafToolCalls(content), [content]);
  const stepCount = count + leafRows.length;
  const forcedOpen = running || hasPendingAction;
  const defaultOpen = density === 'detailed';
  const open = forcedOpen || (manualOverride ?? defaultOpen);
  return (
    <div className="my-2 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-caption">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setManualOverride((prev) => !(prev ?? defaultOpen))}
        className="flex w-full cursor-pointer select-none items-center justify-between text-left text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
      >
        <span className="inline-flex items-center gap-1.5">
          {running ? (
            <>
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
              Thinking…
            </>
          ) : (
            <>
              <span className="inline-block size-1.5 rounded-full bg-semantic-success" />
              Thought {stepCount > 0 ? `· ${stepCount} step${stepCount > 1 ? 's' : ''}` : ''}
            </>
          )}
          <span
            aria-hidden
            className={`ml-1 text-ink-tertiary transition-transform ${open ? 'rotate-90' : ''}`}
          >
            ›
          </span>
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 border-l-2 border-hairline pl-3">
          {children}
          {leafRows.map((r) => (
            <ChatToolCall
              key={r.toolCallId}
              name={humanizeToolName(r.name)}
              status={r.status}
              summary={`via ${r.via}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
