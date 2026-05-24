import { RequestContext } from '@mastra/core/request-context';
import type { ToolExecutionContext } from '@mastra/core/tools';
import type { CopilotRequestContext } from './request-context.ts';

/**
 * Build a Mastra ToolExecutionContext seeded with an actor identity, for use
 * in agent-tool unit tests. Mirrors what the live agent factory passes to
 * tool.execute() at runtime.
 */
export function makeToolContext(actor: {
  user_id: string;
  type?: 'user';
}): ToolExecutionContext<unknown, unknown, CopilotRequestContext> {
  const rc = new RequestContext<CopilotRequestContext>();
  rc.set('actor', { type: actor.type ?? 'user', user_id: actor.user_id });
  return {
    requestContext: rc,
    toolCallId: 'test-call',
    messages: [],
  } as ToolExecutionContext<unknown, unknown, CopilotRequestContext>;
}
