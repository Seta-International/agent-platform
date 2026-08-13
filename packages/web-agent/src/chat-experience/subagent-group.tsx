import { Avatar, type ChatToolCallStatus, ChatToolCalls } from '@seta/shared-ui';
import { humanizeToolName, type LeafToolCall } from './leaf-tool-calls';

const LEAF_STATUS: Record<LeafToolCall['status'], ChatToolCallStatus> = {
  running: 'running',
  ok: 'complete',
  error: 'error',
};

export interface SubagentGroupProps {
  /** Humanized agent label (already `agentLabel(...)`-formatted, e.g. "Planner"). */
  agent: string;
  rows: readonly LeafToolCall[];
  /** Drive the nested calls' expansion from the parent chain-of-thought state. */
  open: boolean;
}

/**
 * One delegated subagent's leaf tool calls rendered as a unit: an agent header
 * (Avatar + step count) over that agent's `ChatToolCalls`. Replaces the old flat
 * "via {Agent}" rows so a multi-step delegation reads as one block. `label` on
 * ChatToolCalls is a no-op at 0.1.6, so the header is our own markup.
 */
export function SubagentGroup({ agent, rows, open }: SubagentGroupProps) {
  const calls = rows.map((r) => ({
    key: r.toolCallId,
    name: humanizeToolName(r.name),
    status: LEAF_STATUS[r.status],
  }));
  const stepLabel = `${rows.length} step${rows.length === 1 ? '' : 's'}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-sm text-secondary">
        {/* The header spells the agent name out next to the avatar, so Astryx's
            name-on-hover tooltip would only duplicate it in the a11y tree. */}
        <Avatar name={agent} size="sm" tooltip={false} />
        <span className="font-medium text-primary">{agent}</span>
        <span aria-hidden>·</span>
        <span>{stepLabel}</span>
      </div>
      {/* A left rail ties the delegated calls to their agent header so the
          nesting reads as one block instead of a flat list. */}
      <div className="ml-2.5 border-l border-border pl-3">
        <ChatToolCalls calls={calls} isExpanded={open} />
      </div>
    </div>
  );
}
