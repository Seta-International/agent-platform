import type { RequestContext } from '@mastra/core/request-context';
import type { z } from 'zod';
import { defineCopilotTool } from './define-copilot-tool.ts';
import type { CrossModuleReadToolSpec } from './registry.ts';
import { sessionFromRequestContext } from './session-context.ts';
import type { CopilotTool } from './tool.ts';

/**
 * Wrap a cross-module read (shape `{session, input} → output`) as a Mastra tool
 * the LLM can call directly. Session is derived from `requestContext` so the
 * caller (the agent) never sees a `session` field on the input schema.
 */
export function defineCrossModuleReadAsTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(spec: {
  id: string;
  name: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  rbac: string;
  execute: CrossModuleReadToolSpec<z.infer<I>, z.infer<O>>['execute'];
}): CopilotTool {
  return defineCopilotTool({
    id: spec.id,
    name: spec.name,
    description: spec.description,
    input: spec.inputSchema,
    output: spec.outputSchema,
    rbac: spec.rbac,
    execute: async (input, ctx) => {
      if (!ctx.requestContext) throw new Error('unauthenticated');
      const { tenantId, userId } = await sessionFromRequestContext(
        ctx.requestContext as RequestContext,
      );
      return spec.execute({
        session: { tenant_id: tenantId, user_id: userId },
        input: input as z.infer<I>,
      });
    },
  });
}
