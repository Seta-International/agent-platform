import { type AgentTool, defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import type { DatasetItemToolMock } from './dataset.ts';

/**
 * Build real, executable AgentTools from per-case mocks so the quality lane's
 * live Mastra tool loop returns canned evidence (reproducible inputs) while the
 * model's generation stays real. Schemas are permissive on purpose — the mock
 * just needs to be callable by the loop.
 */
export function buildMockTools(mocks: DatasetItemToolMock[]): AgentTool[] {
  return mocks.map((m) =>
    defineAgentTool({
      id: m.toolId,
      name: m.toolId,
      description: `Eval mock for ${m.toolId}`,
      input: z.any(),
      output: z.any(),
      execute: async (input: unknown) => m.respond(input),
    }),
  );
}
