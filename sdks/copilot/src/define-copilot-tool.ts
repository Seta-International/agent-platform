import { createTool } from '@mastra/core/tools';
import type { z } from 'zod';
import { registerToolPermission } from './rbac.ts';
import { RequestContextSchema } from './request-context.ts';
import type { CopilotTool, CopilotToolSpec } from './tool.ts';

/**
 * Author an agent tool against the copilot SDK contract. One call replaces
 * the `createTool({ ... }) + registerToolPermission(tool, perm)` pair.
 */
export function defineCopilotTool<
  I extends z.ZodTypeAny,
  O extends z.ZodTypeAny,
  S extends z.ZodTypeAny = z.ZodTypeAny,
  R extends z.ZodTypeAny = z.ZodTypeAny,
>(spec: CopilotToolSpec<I, O, S, R>): CopilotTool {
  const tool = createTool({
    id: spec.id,
    description: spec.description,
    inputSchema: spec.input,
    outputSchema: spec.output,
    requestContextSchema: RequestContextSchema,
    ...(spec.suspendSchema ? { suspendSchema: spec.suspendSchema } : {}),
    ...(spec.resumeSchema ? { resumeSchema: spec.resumeSchema } : {}),
    // Mastra's `execute` typing uses a conditional InferSchema<I> that collapses
    // to `unknown` under a `z.ZodTypeAny` generic; the runtime contract matches
    // exactly, so we widen here rather than pollute the authoring type.
    execute: spec.execute as never,
  });
  if (spec.rbac) registerToolPermission(tool, spec.rbac);
  if (spec.needsApproval) Object.assign(tool, { needsApproval: true });
  // Expose the friendly name on the tool object so the agent factory can build a
  // tool catalog (id → name) without re-deriving it from the spec.
  Object.assign(tool, { displayName: spec.name });
  return tool;
}
