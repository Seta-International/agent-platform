import { type ZodType, z } from 'zod';

export type JsonSchemaDescriptor = Record<string, unknown>;

export const workflowInputSchemaRegistry = new Map<string, JsonSchemaDescriptor>();

export function registerWorkflowInputSchema(workflowId: string, schema: ZodType): void {
  workflowInputSchemaRegistry.set(workflowId, z.toJSONSchema(schema) as JsonSchemaDescriptor);
}

export function getWorkflowInputSchema(workflowId: string): JsonSchemaDescriptor | undefined {
  return workflowInputSchemaRegistry.get(workflowId);
}
