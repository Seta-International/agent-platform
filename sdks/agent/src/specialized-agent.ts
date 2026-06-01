import type { z } from 'zod';
import type { AgentResult } from './trust.ts';

/** Session-derived context passed into a specialized agent's `run`. */
export interface SpecializedAgentRunCtx {
  tenantId: string;
  actorUserId: string;
  abortSignal?: AbortSignal;
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
