import type { z } from 'zod';
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
  abortSignal?: AbortSignal;
  /** Optional sink for sub-step events emitted while this agent runs. The inline
   *  runner provides it; the queued runner and direct callers leave it undefined. */
  onEvent?: (event: SubStepEvent) => void;
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
