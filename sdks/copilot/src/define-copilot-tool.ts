import { createTool } from '@mastra/core/tools';
import type { z } from 'zod';
import { registerToolPermission } from './rbac.ts';
import { RequestContextSchema } from './request-context.ts';
import type { CopilotTool, CopilotToolSpec } from './tool.ts';

/**
 * Author an agent tool against the copilot SDK contract. One call replaces
 * the `createTool({ ... }) + registerToolPermission(tool, perm)` pair.
 */
export function defineCopilotTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  spec: CopilotToolSpec<I, O>,
): CopilotTool {
  const tool = createTool({
    id: spec.id,
    description: spec.description,
    inputSchema: spec.input,
    outputSchema: spec.output,
    requestContextSchema: RequestContextSchema,
    execute: spec.execute,
  });
  if (spec.rbac) registerToolPermission(tool, spec.rbac);
  if (spec.needsApproval) Object.assign(tool, { needsApproval: true });
  return tool;
}
