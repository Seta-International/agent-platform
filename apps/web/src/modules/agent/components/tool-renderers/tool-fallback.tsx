import { ChatToolCall } from '@seta/shared-ui';
import { humanizeToolName } from '../../chat-experience/leaf-tool-calls';
import { summarizeArgs } from './summarize-args';

interface ToolCallPart {
  toolName?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
  status?: { type?: string };
}

/**
 * Generic renderer for any tool-call part that has no registered UI — the
 * orchestrator's internal tools (`staffing_analyzeTasks`, …) and any MCP tool.
 * The assistant-ui `GroupedParts` contract expects `part.toolUI ?? <Fallback>`;
 * returning null here is what leaves the chain-of-thought step visibly empty.
 */
export function ToolFallback({ part }: { part: ToolCallPart }) {
  const name = humanizeToolName(part.toolName);
  const type = part.status?.type;
  if (type === 'complete' || type === undefined) {
    if (part.isError) return <ChatToolCall name={name} status="error" summary="failed" />;
    return <ChatToolCall name={name} status="ok" payload={part.result ?? undefined} />;
  }
  if (type === 'incomplete') return <ChatToolCall name={name} status="error" summary="failed" />;
  return <ChatToolCall name={name} status="running" summary={summarizeArgs(part.args)} />;
}
