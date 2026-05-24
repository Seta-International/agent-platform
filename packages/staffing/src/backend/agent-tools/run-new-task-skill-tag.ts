import type { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { plannerGetTaskTool } from '@seta/planner/agent-tools';
import { z } from 'zod';
import { NEW_TASK_SKILL_TAG_WORKFLOW_ID } from '../workflows/new-task-skill-tag/index.ts';

type ExecutableTool<I, O> = {
  execute?: (input: { context: I }, ctx: unknown) => Promise<O>;
};

export const staffingRunNewTaskSkillTagTool = defineCopilotTool({
  id: 'staffing_runNewTaskSkillTag',
  name: 'Tag New Tasks With Skills',
  description:
    'Start the new-task-skill-tag workflow for a task. Classifies skills, ranks candidates, and surfaces an in-app approval card. Returns the runId; do not wait for the approval inline.',
  input: z.object({
    taskId: z.string().describe('The task to assign'),
    threadId: z.string().optional().describe('The current chat thread id'),
  }),
  output: z.object({
    runId: z.string(),
  }),
  rbac: 'copilot.workflow.run.execute.self',
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const mastra = (ctx as { mastra?: Mastra }).mastra;
    if (!mastra) throw new Error('mastra_unavailable');

    const typed = plannerGetTaskTool as unknown as ExecutableTool<
      { taskId: string },
      { task: { taskId: string; tenantId: string; groupId: string } }
    >;
    if (!typed.execute) throw new Error('planner_get_task_unavailable');
    const taskOut = await typed.execute({ context: { taskId: input.taskId } }, ctx);
    const task = taskOut.task;

    const wf = mastra.getWorkflow(NEW_TASK_SKILL_TAG_WORKFLOW_ID);
    const run = await wf.createRun();

    const requestContext = new RequestContext();
    requestContext.set('actor', { type: 'user', user_id: actor.user_id });
    requestContext.set('tenantId', task.tenantId);
    requestContext.set('startedBy', actor.user_id);
    requestContext.set('startedVia', 'chat');
    if (input.threadId) requestContext.set('parentThreadId', input.threadId);

    await run.startAsync({
      inputData: {
        taskRef: {
          taskId: task.taskId,
          tenantId: task.tenantId,
          groupId: task.groupId,
        },
        initiatedBy: {
          userId: actor.user_id,
          via: 'chat',
          threadId: input.threadId,
        },
      },
      requestContext,
    });

    return { runId: run.runId };
  },
});
