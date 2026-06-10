import type { z } from 'zod';
import { assertNoSessionField } from './registry-assertions.ts';

export type Domain = 'work' | 'people' | 'self' | 'meta' | 'knowledge';

export interface SpecialistSpec {
  domain: Domain;
  id: string;
  description: string;
  instructions: (ctx: { runtimeContext: unknown }) => string;
  model?: string;
  tools: Record<string, unknown>;
  workflows?: Record<string, unknown>;
}

export interface CrossModuleSession {
  tenant_id: string;
  user_id: string;
  /** Resolved permission set, supplied by callers that have a session (e.g. the
   *  cross-module read-as-tool). Optional so workflow-internal constructors that
   *  predate session-permission threading still type-check. */
  effective_permissions?: ReadonlySet<string>;
  role_summary: { readonly roles: readonly string[]; readonly cross_tenant_read: boolean };
}

export interface CrossModuleReadCtx<I = unknown> {
  session: CrossModuleSession;
  input: I;
}

export interface CrossModuleReadToolSpec<I = unknown, O = unknown> {
  id: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  rbac: string;
  availableTo: 'all-specialists' | string[];
  execute: (ctx: CrossModuleReadCtx<I>) => Promise<O>;
}

/**
 * Optional dedupe hook the engine consults before creating a new run.
 *
 * Returning a runId tells the engine "an in-flight run for this input already
 * exists; reuse it instead of starting a second one". Used to make the
 * `/workflows/runs/:workflowId/start` endpoint idempotent for workflows whose
 * domain contract is "at most one pending proposal per <key>" (e.g.
 * planner.assignBySkill, which is at most one per task).
 *
 * The hook is invoked with the raw request body — implementations must parse
 * it (via inputSchema or otherwise) and decide on null when the shape isn't
 * recognisable.
 */
export type WorkflowDedupeKey = (
  input: unknown,
  session: CrossModuleSession,
) => Promise<string | null>;

export interface WorkflowSpec {
  domain: Domain;
  id: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  workflow: unknown;
  hitlSteps?: string[];
  dedupeKey?: WorkflowDedupeKey;
}

export class RegistryFrozenError extends Error {
  constructor() {
    super('AgentRegistry is frozen; register at module load time only.');
  }
}
export class RegistryNotFrozenError extends Error {
  constructor() {
    super('AgentRegistry not frozen; call freeze() in app boot first.');
  }
}

const state = {
  frozen: false,
  specialists: [] as SpecialistSpec[],
  crossReadTools: [] as CrossModuleReadToolSpec<unknown, unknown>[],
  workflows: [] as WorkflowSpec[],
};

export const AgentRegistry = {
  registerSpecialist(spec: SpecialistSpec): void {
    if (state.frozen) throw new RegistryFrozenError();
    if (!spec.description) throw new Error(`Specialist ${spec.id} missing description`);
    state.specialists.push(spec);
  },
  registerCrossModuleReadTool<I, O>(spec: CrossModuleReadToolSpec<I, O>): void {
    if (state.frozen) throw new RegistryFrozenError();
    if (!spec.rbac) throw new Error(`Cross-module read tool ${spec.id} missing rbac`);
    state.crossReadTools.push(spec as CrossModuleReadToolSpec<unknown, unknown>);
  },
  registerWorkflow(spec: WorkflowSpec): void {
    if (state.frozen) throw new RegistryFrozenError();
    assertNoSessionField(spec.inputSchema, spec.id);
    state.workflows.push(spec);
  },
  freeze(): void {
    state.frozen = true;
  },
  isFrozen(): boolean {
    return state.frozen;
  },
  listSpecialists(domain: Domain): SpecialistSpec[] {
    return state.specialists.filter((s) => s.domain === domain);
  },
  listWorkflows(domain: Domain): WorkflowSpec[] {
    return state.workflows.filter((w) => w.domain === domain);
  },
  /**
   * Look up a workflow spec by the intrinsic Mastra workflow id
   * (e.g. `planner.assignBySkill`). Matches via `(spec.workflow as {id}).id`
   * so callers don't have to know which alias the route received.
   */
  findWorkflowSpecByMastraId(mastraId: string): WorkflowSpec | undefined {
    return state.workflows.find((w) => {
      const id = (w.workflow as { id?: unknown } | null)?.id;
      return typeof id === 'string' && id === mastraId;
    });
  },
  listCrossModuleReadTools(): CrossModuleReadToolSpec[] {
    return state.crossReadTools.slice();
  },
  snapshot() {
    if (!state.frozen) throw new RegistryNotFrozenError();
    return {
      domains: Array.from(new Set(state.specialists.map((s) => s.domain))).sort(),
      specialists: state.specialists.slice(),
      crossReadTools: state.crossReadTools.slice(),
      workflows: state.workflows.slice(),
    };
  },
  __resetForTests(): void {
    state.frozen = false;
    state.specialists = [];
    state.crossReadTools = [];
    state.workflows = [];
  },
};
