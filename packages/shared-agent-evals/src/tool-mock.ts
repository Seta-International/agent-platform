import { type AgentTool, defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import type { DatasetItemToolMock } from './dataset.ts';

/**
 * Build real, executable AgentTools from per-case mocks so the quality lane's
 * live Mastra tool loop returns canned evidence (reproducible inputs) while the
 * model's generation stays real. Schemas are permissive on purpose — the mock
 * just needs to be callable by the loop.
 */
export function buildMockTools(mocks: DatasetItemToolMock[]) {
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

/**
 * Look up a built mock tool by id from the array a suite's `buildQualitySpec`
 * receives. Throws a self-describing error when the case omitted a mock for a
 * tool the specialist's loop can call — otherwise the missing tool surfaces as
 * an opaque `undefined.execute` TypeError deep in the nightly real-model run.
 */
export function requireMockTool(mocks: AgentTool[], toolId: string): AgentTool {
  const found = mocks.find((m) => (m as { id: string }).id === toolId);
  if (!found) {
    throw new Error(
      `quality eval: no tool mock for '${toolId}' — every tool the specialist can call must be listed in the case's toolMocks`,
    );
  }
  return found;
}
