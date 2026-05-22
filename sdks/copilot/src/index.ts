import type { ZodSchema } from 'zod';

export interface SessionLike {
  tenant_id: string;
  user_id: string;
  effective_permissions: ReadonlySet<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
}

// Shape-mirror of Mastra's RequestContext. Re-typed here so module agent-tools
// don't need a runtime Mastra import; the @seta/copilot adapter handles any
// shimming if the Mastra signature drifts.
export interface RequestContext {
  [key: string]: unknown;
}

export interface CopilotTool<I = unknown, O = unknown> {
  id: string;
  description: string;
  input: ZodSchema<I>;
  output: ZodSchema<O>;
  rbac: readonly string[];
  needsApproval?: boolean;
  execute: (input: I, ctx: { session: SessionLike; requestContext: RequestContext }) => Promise<O>;
}

export type WorkflowBuilder<TMastra = unknown> = (mastra: TMastra) => unknown;

export function defineCopilotTool<I, O>(spec: CopilotTool<I, O>): CopilotTool<I, O> {
  return spec;
}
