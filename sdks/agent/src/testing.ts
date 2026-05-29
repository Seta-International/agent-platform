import { RequestContext } from '@mastra/core/request-context';
import type { ToolExecutionContext } from '@mastra/core/tools';
import { noopObserve } from '@mastra/core/tools';
import type { AgentRequestContext } from './request-context.ts';

/**
 * Build a Mastra ToolExecutionContext seeded with an actor identity, for use
 * in agent-tool unit tests. Mirrors what the live agent factory passes to
 * tool.execute() at runtime.
 */
export function makeToolContext(actor: {
  user_id: string;
  type?: 'user';
  tenant_id?: string;
}): ToolExecutionContext<unknown, unknown, AgentRequestContext> {
  const rc = new RequestContext<AgentRequestContext>();
  rc.set('actor', { type: actor.type ?? 'user', user_id: actor.user_id });
  // Production always sets tenant_id (wrap-execute keys its circuit breaker on it),
  // so the test helper mirrors that with a stable default when no tenant is supplied.
  rc.set('tenant_id', actor.tenant_id ?? '00000000-0000-0000-0000-000000000000');
  return {
    requestContext: rc,
    toolCallId: 'test-call',
    messages: [],
    observe: noopObserve,
  } as ToolExecutionContext<unknown, unknown, AgentRequestContext>;
}
