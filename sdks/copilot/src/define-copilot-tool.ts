import { createTool } from '@mastra/core/tools';
import type { z } from 'zod';
import { registerToolPermission } from './rbac.ts';
import { RequestContextSchema } from './request-context.ts';
import type { CopilotTool, CopilotToolSpec } from './tool.ts';
import { wrapExecute } from './wrap-execute.ts';

/**
 * Author an agent tool against the copilot SDK contract. One call replaces
 * the `createTool({ ... }) + registerToolPermission(tool, perm)` pair.
 *
 * Every tool authored through this factory is wrapped with:
 *   - an execution timeout (read 30s / write 60s defaults, or
 *     `spec.executionTimeoutMs` capped by COPILOT_TOOL_TIMEOUT_MAX_MS);
 *   - a composed `AbortSignal` injected into ctx.abortSignal — forward this
 *     into every fetch / DB / vector query so resources release on timeout;
 *   - a per-(tenant, tool) circuit breaker that fails fast after 3
 *     consecutive timeouts or unhandled exceptions.
 */
export function defineCopilotTool<
  I extends z.ZodTypeAny,
  O extends z.ZodTypeAny,
  S extends z.ZodTypeAny = z.ZodTypeAny,
  R extends z.ZodTypeAny = z.ZodTypeAny,
>(spec: CopilotToolSpec<I, O, S, R>): CopilotTool {
  // Pass-through to Mastra's native HITL mechanism. The agent loop
  // (mastra/packages/core/src/loop/workflows/agentic-execution/tool-call-step.ts)
  // reads `Tool.requireApproval` (boolean or per-call predicate) to decide
  // whether to emit a `tool-call-approval` stream chunk and suspend.
  //
  // Do NOT `Object.assign(tool, { needsApproval })` after the fact — Mastra
  // only reads `needsApproval` on Vercel/AI-SDK tools (isVercelTool() returns
  // false for Mastra Tool instances, see mastra/packages/core/src/tools/toolchecks.ts).
  const wrapped = wrapExecute(
    {
      id: spec.id,
      needsApproval: spec.needsApproval,
      executionTimeoutMs: spec.executionTimeoutMs,
    },
    spec.execute as never,
  );
  const tool = createTool({
    id: spec.id,
    description: spec.description,
    inputSchema: spec.input,
    outputSchema: spec.output,
    requestContextSchema: RequestContextSchema,
    suspendSchema: spec.suspendSchema,
    resumeSchema: spec.resumeSchema,
    // Same `InferSchema<I>` vs `z.infer<I>` generic-erasure dance as `execute`
    // below — the runtime contract matches Mastra's `requireApproval` 1:1
    // (boolean or per-call predicate), so we widen at the boundary rather than
    // leak Mastra's internal `InferSchema` helper into the authoring type.
    requireApproval: (spec.needsApproval ?? false) as never,
    // Mastra's `execute` typing uses a conditional InferSchema<I> that collapses
    // to `unknown` under a `z.ZodTypeAny` generic; the runtime contract matches
    // exactly, so we widen here rather than pollute the authoring type.
    execute: wrapped as never,
  });
  if (spec.rbac) registerToolPermission(tool, spec.rbac);
  // displayName has no Mastra equivalent — it is consumed only by our own
  // agent-factory tool catalog. Keep as an attached property.
  Object.assign(tool, { displayName: spec.name });
  return tool;
}
