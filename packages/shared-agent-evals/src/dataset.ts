import type { SpecializedAgentSpec } from '@seta/agent-sdk';

export interface EvalActor {
  tenantId: string;
  userId: string;
  permissions?: readonly string[];
}

export interface EvalCase<I = unknown> {
  /** Unique, human-readable case name within its suite. */
  name: string;
  /** Which runner picks it up. Phase 1 ships 'deterministic' only. */
  layer: 'deterministic' | 'quality';
  input: I;
  actor: EvalActor;
  /** Expected result for golden/exact scorers; omit when not asserting equality. */
  groundTruth?: unknown;
}

export interface EvalSuite<I = unknown, O = unknown> {
  /** The SpecializedAgentSpec.id this suite covers (matched by the coverage gate). */
  specId: string;
  /** Builds the spec under eval with fake deps injected (no LLM, no DB). */
  buildSpec: () => SpecializedAgentSpec<I, O>;
  cases: EvalCase<I>[];
}

export interface EvalManifest {
  /** Owning module package name, e.g. '@seta/planner'. */
  module: string;
  suites: EvalSuite[];
}

export function defineEvalCase<I>(c: EvalCase<I>): EvalCase<I> {
  return c;
}

export function defineEvalSuite<I, O>(s: EvalSuite<I, O>): EvalSuite<I, O> {
  return s;
}
