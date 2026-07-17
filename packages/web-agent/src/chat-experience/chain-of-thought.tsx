import { useAuiState } from '@assistant-ui/react';
import { type ChatToolCallStatus, ChatToolCalls, Collapsible } from '@seta/shared-ui';
import { type ReactNode, useMemo, useState } from 'react';
import { extractLeafToolCalls, humanizeToolName, type LeafToolCall } from './leaf-tool-calls';
import { useDensity } from './use-density';

export interface ChainOfThoughtProps {
  running: boolean;
  count: number;
  indices: readonly number[];
  children: ReactNode;
}

const LEAF_STATUS: Record<LeafToolCall['status'], ChatToolCallStatus> = {
  running: 'running',
  ok: 'complete',
  error: 'error',
};

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
  const calls = useMemo(
    () =>
      leafRows.map((r) => ({
        key: r.toolCallId,
        name: humanizeToolName(r.name),
        status: LEAF_STATUS[r.status],
        target: `via ${r.via}`,
      })),
    [leafRows],
  );
  return (
    <Collapsible
      isOpen={open}
      onOpenChange={() => setManualOverride((prev) => !(prev ?? defaultOpen))}
      trigger={
        running
          ? 'Thinking…'
          : `Thought ${stepCount > 0 ? `· ${stepCount} step${stepCount > 1 ? 's' : ''}` : ''}`
      }
    >
      {children}
      {/* Drive the leaf group from the same `open` state rather than letting it
          keep its own: nested inside an open chain-of-thought the rows were
          always flat/visible before, and a second collapsed layer would bury a
          pending approval one extra click deep. */}
      <ChatToolCalls calls={calls} isExpanded={open} />
    </Collapsible>
  );
}
