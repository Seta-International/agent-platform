import type { z } from 'zod';

/**
 * WorkflowSpec.inputSchema is LLM-visible. A `session` field there is an
 * auth-design violation: session must derive from requestContext server-side,
 * never from caller-supplied JSON. See spec
 * docs/superpowers/specs/2026-05-25-reasoning-first-planner-copilot-design.md §5.6.
 */
export function assertNoSessionField(schema: z.ZodTypeAny, workflowId: string): void {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  if (shape && Object.hasOwn(shape, 'session')) {
    throw new Error(
      `Workflow '${workflowId}' inputSchema contains a 'session' field. ` +
        `Session must derive from requestContext server-side and never appear in LLM-visible ` +
        `input schemas. Use sessionFromRequestContext(requestContext) inside the first step.`,
    );
  }
}
