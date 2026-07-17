import { ChatToolCalls } from '@seta/shared-ui';
import { humanizeToolName } from '../../chat-experience/leaf-tool-calls';
import { payloadDetail } from './payload-detail';
import { summarizeArgs } from './summarize-args';
import { toolErrorMessage } from './tool-error';

interface ToolCallPart {
  toolName?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
  // `error` is present at runtime on an incomplete status (MessagePartStatus).
  status?: { type?: string; error?: unknown };
}

/**
 * Generic renderer for any tool-call part that has no registered UI — the
 * orchestrator's internal tools (`staffing_analyzeTasks`, …) and any MCP tool.
 * Every branch renders a labeled `ChatToolCalls` row so a step is never empty.
 */
export function ToolFallback({ part }: { part: ToolCallPart }) {
  const name = humanizeToolName(part.toolName);
  const type = part.status?.type;
  if (type === 'complete' || type === undefined) {
    if (part.isError)
      return (
        <ChatToolCalls
          calls={[{ name, status: 'error', errorMessage: toolErrorMessage(part.result) }]}
        />
      );
    return (
      <ChatToolCalls
        calls={[{ name, status: 'complete', resultDetail: payloadDetail(part.result) }]}
      />
    );
  }
  if (type === 'incomplete') {
    return (
      <ChatToolCalls
        calls={[{ name, status: 'error', errorMessage: toolErrorMessage(part.status?.error) }]}
      />
    );
  }
  return <ChatToolCalls calls={[{ name, status: 'running', target: summarizeArgs(part.args) }]} />;
}
