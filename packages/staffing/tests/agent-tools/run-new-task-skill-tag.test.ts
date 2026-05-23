import { requiredPermissionFor } from '@seta/copilot-sdk';
import { plannerGetTaskTool } from '@seta/planner/agent-tools';
import { describe, expect, it, vi } from 'vitest';
import { staffingRunNewTaskSkillTagTool } from '../../src/backend/agent-tools/run-new-task-skill-tag.ts';
import { makeToolContext } from '../test-helpers.ts';

describe('copilot_runNewTaskSkillTag tool', () => {
  it('is registered with permission copilot.workflow.run.execute.self', () => {
    expect(requiredPermissionFor(staffingRunNewTaskSkillTagTool)).toBe(
      'copilot.workflow.run.execute.self',
    );
  });

  it('starts the workflow with the task ref and chat-initiated metadata', async () => {
    const startAsync = vi.fn().mockResolvedValue(undefined);
    const fakeRun = { runId: 'run-abc', startAsync };
    const fakeWorkflow = { createRun: vi.fn().mockResolvedValue(fakeRun) };
    const mastra = { getWorkflow: vi.fn().mockReturnValue(fakeWorkflow) };

    vi.spyOn(
      plannerGetTaskTool as unknown as { execute: NonNullable<typeof plannerGetTaskTool.execute> },
      'execute',
    ).mockResolvedValue({
      task: {
        taskId: '11111111-1111-1111-1111-111111111111',
        tenantId: '22222222-2222-2222-2222-222222222222',
        groupId: '33333333-3333-3333-3333-333333333333',
      },
    } as never);

    const ctx = makeToolContext({ user_id: '55555555-5555-5555-5555-555555555555' });
    (ctx as unknown as { mastra: unknown }).mastra = mastra;

    const result = await staffingRunNewTaskSkillTagTool.execute!(
      {
        taskId: '11111111-1111-1111-1111-111111111111',
        threadId: '44444444-4444-4444-4444-444444444444',
      },
      ctx,
    );

    expect(result).toEqual({ runId: 'run-abc' });
    expect(mastra.getWorkflow).toHaveBeenCalledWith('copilot.new-task-skill-tag');
    expect(startAsync).toHaveBeenCalledTimes(1);
    const inputData = startAsync.mock.calls[0]?.[0].inputData;
    expect(inputData.taskRef.taskId).toBe('11111111-1111-1111-1111-111111111111');
    expect(inputData.initiatedBy).toMatchObject({
      userId: '55555555-5555-5555-5555-555555555555',
      via: 'chat',
      threadId: '44444444-4444-4444-4444-444444444444',
    });
  });
});
