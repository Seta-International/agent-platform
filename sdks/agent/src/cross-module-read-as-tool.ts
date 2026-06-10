import type { RequestContext } from '@mastra/core/request-context';
import type { z } from 'zod';
import { defineAgentTool } from './define-agent-tool.ts';
import type { CrossModuleReadToolSpec } from './registry.ts';
import { sessionFromRequestContext } from './session-context.ts';
import type { AgentTool } from './tool.ts';

/**
 * Wrap a cross-module read (shape `{session, input} → output`) as a Mastra tool
 * the LLM can call directly. Session is derived from `requestContext` so the
 * caller (the agent) never sees a `session` field on the input schema.
 *
 * RBAC is re-checked here against the caller's role_summary so the callee
 * always enforces access regardless of how the tool was invoked.
 */
export function defineCrossModuleReadAsTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(spec: {
  id: string;
  name: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  rbac: string;
  execute: CrossModuleReadToolSpec<z.infer<I>, z.infer<O>>['execute'];
}): AgentTool {
  return defineAgentTool({
    id: spec.id,
    name: spec.name,
    description: spec.description,
    input: spec.inputSchema,
    output: spec.outputSchema,
    rbac: spec.rbac,
    execute: async (input, ctx) => {
      if (!ctx.requestContext) throw new Error('unauthenticated');
      const { tenantId, userId, roleSummary, effectivePermissions } =
        await sessionFromRequestContext(ctx.requestContext as RequestContext);
      if (!effectivePermissions.has(spec.rbac)) {
        throw new Error(`forbidden: ${spec.rbac} required`);
      }
      return spec.execute({
        session: {
          tenant_id: tenantId,
          user_id: userId,
          effective_permissions: effectivePermissions,
          role_summary: roleSummary,
        },
        input: input as z.infer<I>,
      });
    },
  });
}
