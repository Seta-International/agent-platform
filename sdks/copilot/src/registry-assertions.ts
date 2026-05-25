import type { z } from 'zod';

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
