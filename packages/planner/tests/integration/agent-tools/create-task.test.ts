import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { plannerCreateTaskTool } from '../../../src/backend/agent-tools/create-task.ts';
import { makeToolContext, withAgentTestDb } from '../agent-tools-helpers.ts';

function makeMockMastra(opts?: { workflowMissing?: boolean }) {
  const startCalls: { inputData: unknown; requestContext: unknown }[] = [];
  const mockRunId = randomUUID();
  return {
    startCalls,
    mockRunId,
    mastra: {
      getWorkflow: (_id: string) => {
        if (opts?.workflowMissing) return undefined;
        return {
          createRun: async () => ({
            runId: mockRunId,
            start: async (args: { inputData: unknown; requestContext: unknown }) => {
              startCalls.push(args);
            },
          }),
        };
      },
    },
  };
}

describe('planner_createTask — triggers dedupOnCreate workflow', () => {
  it('starts the dedupOnCreate workflow and returns runId', async () => {
    await withAgentTestDb(async () => {
      const { mastra, mockRunId, startCalls } = makeMockMastra();
      const tool = plannerCreateTaskTool();
      const ctx = makeToolContext({ user_id: randomUUID(), tenant_id: randomUUID() });
      // biome-ignore lint/suspicious/noExplicitAny: inject mock mastra
      (ctx as any).mastra = mastra;

      const result = (await tool.execute!(
        {
          title: 'New task X',
          description: 'desc',
          skill_tags: [],
          plan_id: undefined,
          bucket_id: undefined,
        },
        ctx,
      )) as { kind: string; runId?: string };

      expect(result.kind).toBe('workflow-started');
      expect(result.runId).toBe(mockRunId);
      // Workflow start was called (fire-and-forget, may resolve after test)
      await new Promise((r) => setTimeout(r, 10));
      expect(startCalls.length).toBe(1);
      expect((startCalls[0]!.inputData as { title: string }).title).toBe('New task X');
    });
  });

  it('throws when mastra is not available', async () => {
    await withAgentTestDb(async () => {
      const tool = plannerCreateTaskTool();
      const ctx = makeToolContext({ user_id: randomUUID(), tenant_id: randomUUID() });
      // No mastra on context

      await expect(
        tool.execute!(
          { title: 't', description: '', skill_tags: [], plan_id: undefined, bucket_id: undefined },
          ctx,
        ),
      ).rejects.toThrow('Mastra runtime unavailable');
    });
  });

  it('throws when dedupOnCreate workflow is not registered', async () => {
    await withAgentTestDb(async () => {
      const { mastra } = makeMockMastra({ workflowMissing: true });
      const tool = plannerCreateTaskTool();
      const ctx = makeToolContext({ user_id: randomUUID(), tenant_id: randomUUID() });
      // biome-ignore lint/suspicious/noExplicitAny: inject mock mastra
      (ctx as any).mastra = mastra;

      await expect(
        tool.execute!(
          { title: 't', description: '', skill_tags: [], plan_id: undefined, bucket_id: undefined },
          ctx,
        ),
      ).rejects.toThrow('dedupOnCreate workflow not registered');
    });
  });
});
