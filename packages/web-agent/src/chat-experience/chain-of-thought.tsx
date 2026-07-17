import { useAuiState } from '@assistant-ui/react';
import { Collapsible } from '@seta/shared-ui';
import { type ReactNode, useMemo, useState } from 'react';
import { extractLeafToolCalls, type LeafToolCall } from './leaf-tool-calls';
import { SubagentGroup } from './subagent-group';
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
  // Group each subagent's leaf calls under one header (first-seen agent order).
  const groups = useMemo(() => {
    const byAgent = new Map<string, LeafToolCall[]>();
    for (const row of leafRows) {
      const list = byAgent.get(row.via);
      if (list) list.push(row);
      else byAgent.set(row.via, [row]);
    }
    return [...byAgent.entries()].map(([agent, rows]) => ({ agent, rows }));
  }, [leafRows]);
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
      {/* One block per delegated subagent, driven by the parent open state so a
          pending approval nested inside stays reachable. */}
      {groups.map((group) => (
        <SubagentGroup key={group.agent} agent={group.agent} rows={group.rows} open={open} />
      ))}
    </Collapsible>
  );
}
