import { ChatToolCalls } from '@seta/shared-ui';
import { humanizeToolName } from '../../chat-experience/leaf-tool-calls';
import { payloadDetail } from './payload-detail';
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
    if (part.isError)
      return <ChatToolCalls calls={[{ name, status: 'error', errorMessage: 'failed' }]} />;
    return (
      <ChatToolCalls
        calls={[{ name, status: 'complete', resultDetail: payloadDetail(part.result) }]}
      />
    );
  }
  if (type === 'incomplete') {
    return <ChatToolCalls calls={[{ name, status: 'error', errorMessage: 'failed' }]} />;
  }
  return <ChatToolCalls calls={[{ name, status: 'running', target: summarizeArgs(part.args) }]} />;
}
