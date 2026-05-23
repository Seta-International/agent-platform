import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  getWorkflowInputSchema,
  registerWorkflowInputSchema,
  workflowInputSchemaRegistry,
} from '../../src/backend/workflows/_infra/input-schema-registry.ts';

describe('inputSchemaRegistry', () => {
  it('stores converted JSON Schema for a workflow id', () => {
    const zod = z.object({ taskId: z.string().uuid(), userId: z.number() });
    registerWorkflowInputSchema('copilot.test', zod);
    const json = getWorkflowInputSchema('copilot.test') as {
      type: string;
      properties: { taskId: { format: string } };
    };
    expect(json).toBeTruthy();
    expect(json.type).toBe('object');
    expect(json.properties.taskId.format).toBe('uuid');
  });

  it('returns undefined for an unknown workflow id', () => {
    expect(getWorkflowInputSchema(`copilot.unknown-${Date.now()}`)).toBeUndefined();
  });

  it('exposes the raw registry map for callers that need iteration', () => {
    const zod = z.object({ x: z.number() });
    registerWorkflowInputSchema('copilot.test-iter', zod);
    expect(workflowInputSchemaRegistry.has('copilot.test-iter')).toBe(true);
  });
});
