import type { MemoryConfig } from '@mastra/core/memory';
import type { RequestContext } from '@mastra/core/request-context';
import type { Memory } from '@mastra/memory';
import { z } from 'zod';
import type { ChatHitlRecorder } from './hitl/chat-hitl.ts';

export const RequestContextSchema = z.object({
  actor: z.object({
    type: z.literal('user'),
    user_id: z.string().min(1),
  }),
});

/**
 * Full state shape carried on the Mastra RequestContext for every agent
 * request. `actor` is validated by Mastra via `requestContextSchema`; the
 * remaining fields are set imperatively by the route layer before the
 * agent/workflow step runs.
 *
 * __seta_chat_hitl_recorder__ is injected by the chat route for tools that
 * write a workflow_approvals row directly (chat-flow HITL). See chat-hitl.ts.
 */
export interface AgentRequestContext {
  actor: { type: 'user'; user_id: string };
  tenant_id: string;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
  effective_permissions: ReadonlySet<string>;
  // Key matches RC_CHAT_HITL_RECORDER in hitl/chat-hitl.ts — typed here so
  // requestContext.get(RC_CHAT_HITL_RECORDER) is type-safe.
  __seta_chat_hitl_recorder__?: ChatHitlRecorder;
  // Key matches RC_AGENT_MEMORY — typed here so requestContext.get(RC_AGENT_MEMORY)
  // is type-safe in tool execute bodies.
  __seta_agent_memory__?: AgentMemoryHandle;
  // The real chat thread id, set by the chat route. Tools must use THIS for
  // conversation-scoped state — never ctx.agent.threadId, which Mastra
  // randomizes per sub-agent delegation (`${chatThreadId}-${uuid}`).
  thread_id?: string;
}

/**
 * RequestContext key under which routes inject the chat-resource-scoped
 * Memory instance + its memoryConfig. Tools running in the chat flow read
 * this to do server-side working-memory writes (entity recorder, resolver).
 * No-op when absent (workflow/cron contexts).
 */
export const RC_AGENT_MEMORY = '__seta_agent_memory__' as const;

/**
 * RequestContext key carrying the real chat thread id. Set by the chat route
 * and propagated unchanged into sub-agent tool calls (unlike Mastra's reserved
 * thread key, which is cleared/rewritten per delegation). Conversation-scoped
 * tool state (entity recorder, task-ref resolver) keys on this.
 */
export const RC_THREAD_ID = 'thread_id' as const;

export interface AgentMemoryHandle {
  memory: Memory;
  memoryConfig: MemoryConfig;
}

export interface AuthenticatedUserActor {
  type: 'user';
  user_id: string;
}

export function actorFromContext(ctx: {
  requestContext?: RequestContext<AgentRequestContext>;
}): AuthenticatedUserActor {
  const raw = ctx?.requestContext?.get('actor');
  if (!raw || typeof raw !== 'object') {
    throw new Error('unauthenticated');
  }
  const a = raw as Partial<AuthenticatedUserActor>;
  if (a.type !== 'user' || !a.user_id) {
    throw new Error('unauthenticated');
  }
  return { type: 'user', user_id: a.user_id };
}
