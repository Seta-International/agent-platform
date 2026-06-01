import type { OrchestrationSpec } from './types.ts';

export class DuplicateOrchestrationError extends Error {
  constructor(id: string) {
    super(`Orchestration id "${id}" already registered.`);
  }
}

const state = {
  frozen: false,
  orchestrations: new Map<string, OrchestrationSpec>(),
};

export const OrchestrationRegistry = {
  register(spec: OrchestrationSpec): void {
    if (state.orchestrations.has(spec.id)) throw new DuplicateOrchestrationError(spec.id);
    state.orchestrations.set(spec.id, spec);
  },
  freeze(): void {
    state.frozen = true;
  },
  get(id: string): OrchestrationSpec | undefined {
    return state.orchestrations.get(id);
  },
  __resetForTests(): void {
    state.frozen = false;
    state.orchestrations = new Map();
  },
};
