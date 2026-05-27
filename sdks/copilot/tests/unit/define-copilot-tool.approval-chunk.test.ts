import { Agent } from '@mastra/core/agent';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineCopilotTool } from '../../src/define-copilot-tool';

// Regression guard for the Mastra-native HITL contract that defineCopilotTool
// wires up. Drives a real `Mastra.Agent` with a stubbed language model that
// immediately emits a single tool-call against our `needsApproval: true` tool;
// the agent loop must emit a `tool-call-approval` chunk (the suspend signal)
// instead of executing the tool. If Mastra renames `requireApproval` or
// changes the suspend-chunk type tag, this test fails loudly at CI rather than
// silently bypassing the gate in production.
describe('defineCopilotTool — approval chunk end-to-end', () => {
  it('agent stream emits a tool-call-approval chunk when a write tool is called', async () => {
    let toolExecuted = false;
    const writeTool = defineCopilotTool({
      id: 'x_writeOnce',
      name: 'Write Once',
      description: 'Test write tool that requires approval.',
      input: z.object({ payload: z.string() }),
      output: z.object({ ok: z.boolean() }),
      rbac: 'x.write',
      needsApproval: true,
      execute: async () => {
        toolExecuted = true;
        return { ok: true };
      },
    });

    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'response-metadata',
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'x_writeOnce',
            input: JSON.stringify({ payload: 'hello' }),
          },
          {
            type: 'finish',
            finishReason: 'tool-calls',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        ]),
      }),
    });

    const agent = new Agent({
      name: 'test-agent',
      instructions: 'Test agent.',
      model,
      tools: { x_writeOnce: writeTool },
    });

    const chunks: Array<{ type: string; payload?: unknown }> = [];
    const stream = await agent.stream('do it');
    for await (const chunk of stream.fullStream) {
      chunks.push(chunk as { type: string; payload?: unknown });
      if (chunk.type === 'tool-call-approval') break; // suspend point
    }

    const approval = chunks.find((c) => c.type === 'tool-call-approval');
    expect(approval, 'agent stream must emit tool-call-approval').toBeDefined();
    expect((approval?.payload as { toolName?: string } | undefined)?.toolName).toBe('x_writeOnce');
    expect(toolExecuted, 'tool execute() must NOT run before approval').toBe(false);
  });
});
