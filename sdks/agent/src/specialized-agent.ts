import type { MastraModelConfig } from '@mastra/core/llm';
import type { z } from 'zod';
import type { ChatHitlRecorder } from './hitl/chat-hitl.ts';
import type { AgentMemoryHandle } from './request-context.ts';
import type { AgentResult, TrustEnvelope } from './trust.ts';

/** A sub-step surfaced by an agent that internally delegates to other agents
 *  (e.g. an orchestrator). Mirrors the orchestration kernel's step events, but
 *  declared here so the SDK has no dependency on `@seta/shared-orchestration`. */
export type SubStepEvent =
  | { kind: 'step-start'; stepId: string; agentId: string }
  | { kind: 'step-done'; stepId: string; trust: TrustEnvelope };

/** Session-derived context passed into a specialized agent's `run`. */
export interface SpecializedAgentRunCtx {
  tenantId: string;
  actorUserId: string;
  /** Resolved permission set for the actor, threaded onto the agent's
   *  RequestContext so cross-module read tools can re-check access. Empty when
   *  the caller (queued runner, direct call) has no session. */
  effectivePermissions?: ReadonlySet<string>;
  abortSignal?: AbortSignal;
  /** The real chat thread id (inline chat runs only). Conversation-scoped
   *  memory (entity recorder, task-ref resolver) keys on this — never on
   *  Mastra's per-delegation thread ids. */
  threadId?: string;
  /** Thread-scoped conversation-entities memory handle. The orchestrator sets
   *  RC_AGENT_MEMORY from this so SDK tools can record/resolve entities. */
  entitiesMemory?: AgentMemoryHandle;
  /** Resource-scoped userContext memory handle (the supervisor tree's
   *  GuardedMemory). Read via getSystemMessage; written via the guarded
   *  updateWorkingMemory tool. */
  userMemory?: AgentMemoryHandle;
  /** Per-turn model override (chat inline runs only). Resolved by the chat
   *  route's model registry from the user's explicit model pick; absent ⇒ the
   *  runtime's boot-time default model. */
  model?: MastraModelConfig;
  /** Optional sink for sub-step events emitted while this agent runs. The inline
   *  runner provides it; the queued runner and direct callers leave it undefined. */
  onEvent?: (event: SubStepEvent) => void;
  /** Optional recorder for in-thread HITL approval cards. The chat route's
   *  inline orchestration provides it; queued runners and direct callers leave
   *  it undefined. */
  recordHitlApproval?: ChatHitlRecorder;
}

/**
 * A self-contained unit of work. Invocable on its own (Plan 02 `runAgent`) or
 * as a node in an orchestration DAG. Any LLM reasoning lives inside `run`.
 */
export interface SpecializedAgentSpec<I = unknown, O = unknown> {
  id: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  run: (input: I, ctx: SpecializedAgentRunCtx) => Promise<AgentResult<O>>;
}

export class SpecializedAgentFrozenError extends Error {
  constructor() {
    super('SpecializedAgentRegistry is frozen; register at module load time only.');
  }
}
export class SpecializedAgentNotFrozenError extends Error {
  constructor() {
    super('SpecializedAgentRegistry not frozen; call freeze() in app boot first.');
  }
}
export class DuplicateSpecializedAgentError extends Error {
  constructor(id: string) {
    super(`SpecializedAgent id "${id}" already registered.`);
  }
}

const state = {
  frozen: false,
  agents: new Map<string, SpecializedAgentSpec>(),
};

export const SpecializedAgentRegistry = {
  register<I, O>(spec: SpecializedAgentSpec<I, O>): void {
    if (state.frozen) throw new SpecializedAgentFrozenError();
    if (state.agents.has(spec.id)) throw new DuplicateSpecializedAgentError(spec.id);
    state.agents.set(spec.id, spec as SpecializedAgentSpec);
  },
  freeze(): void {
    state.frozen = true;
  },
  isFrozen(): boolean {
    return state.frozen;
  },
  get(id: string): SpecializedAgentSpec | undefined {
    return state.agents.get(id);
  },
  snapshot(): SpecializedAgentSpec[] {
    if (!state.frozen) throw new SpecializedAgentNotFrozenError();
    return Array.from(state.agents.values());
  },
  __resetForTests(): void {
    state.frozen = false;
    state.agents = new Map();
  },
};
