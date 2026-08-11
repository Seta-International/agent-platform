import type { MemoryConfig } from '@mastra/core/memory';
import { RequestContext } from '@mastra/core/request-context';
import type { Memory } from '@mastra/memory';
import { z } from 'zod';

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
 */
export interface AgentRequestContext {
  actor: { type: 'user'; user_id: string };
  tenant_id: string;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
  effective_permissions: ReadonlySet<string>;
  // The real chat thread id, set by the chat route. Tools must use THIS for
  // conversation-scoped state — never ctx.agent.threadId, which Mastra
  // randomizes per sub-agent delegation (`${chatThreadId}-${uuid}`).
  thread_id?: string;
}

/**
 * RequestContext key carrying the real chat thread id. Set by the chat route
 * and propagated unchanged into sub-agent tool calls (unlike Mastra's reserved
 * thread key, which is cleared/rewritten per delegation). Conversation-scoped
 * tool state (entity recorder, task-ref resolver) keys on this.
 */
export const RC_THREAD_ID = 'thread_id' as const;

/**
 * The one place a sub-agent RequestContext is built.
 *
 * Every orchestrator and specialized agent needs the same four entries, and
 * `thread_id` is the one that is invisible when missing: `recordEntityExposure`
 * and `resolveTaskRef` both read it and both silently no-op without it, so
 * conversation-scoped task references ("the first one", a task's name) stop
 * resolving with nothing logged anywhere. Eleven of the fifteen hand-rolled
 * construction sites had dropped it, which is why that bug kept returning one
 * call site at a time (FUT-859). `request-context-gate.test.ts` holds the line.
 *
 * Shaped to accept a `SpecializedAgentRunCtx` structurally, so a call site reads
 * `buildAgentRequestContext(ctx)`.
 */
export function buildAgentRequestContext(ctx: {
  actorUserId: string;
  tenantId: string;
  effectivePermissions?: ReadonlySet<string>;
  threadId?: string;
}): RequestContext {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
  rc.set('tenant_id', ctx.tenantId);
  rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());
  // Conditional because workflow and cron runs have no conversation: writing a
  // blank would shard entity state under a junk key instead of no-opping. When a
  // thread DOES exist it must travel — that is what the gate enforces.
  if (ctx.threadId) rc.set(RC_THREAD_ID, ctx.threadId);
  return rc;
}

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
