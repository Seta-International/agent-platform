import type { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { plannerGetTaskTool } from '@seta/planner/agent-tools';
import { z } from 'zod';
import { NEW_TASK_SKILL_TAG_WORKFLOW_ID } from '../workflows/new-task-skill-tag/index.ts';

type ExecutableTool<I, O> = {
  execute?: (input: I, ctx: unknown) => Promise<O>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const staffingRunNewTaskSkillTagTool = defineCopilotTool({
  id: 'staffing_runNewTaskSkillTag',
  name: 'Tag New Tasks With Skills',
  description:
    "Start the new-task-skill-tag workflow for a SPECIFIC task by its taskId. Classifies the task's skills, ranks candidate assignees, and surfaces an in-app approval card. Returns the runId; do not wait for the approval inline. If the user describes the task in natural language instead of giving a taskId, FIRST call `search_tasks_semantic` to discover the matching task, then call this tool with that task's id.",
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
    const taskOut = await typed.execute({ taskId: input.taskId }, ctx);
    const task = taskOut.task;

    // Drop threadId if it isn't a UUID — the workflow state schema rejects
    // the client-side local thread ids ("__LOCALID_*") that the chat UI mints
    // before the thread is persisted.
    const threadId = input.threadId && UUID_RE.test(input.threadId) ? input.threadId : undefined;

    const wf = mastra.getWorkflow(NEW_TASK_SKILL_TAG_WORKFLOW_ID);
    const run = await wf.createRun();

    const requestContext = new RequestContext();
    requestContext.set('actor', { type: 'user', user_id: actor.user_id });
    requestContext.set('tenantId', task.tenantId);
    requestContext.set('startedBy', actor.user_id);
    requestContext.set('startedVia', 'chat');
    if (threadId) requestContext.set('parentThreadId', threadId);

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
          threadId,
        },
      },
      requestContext,
    });

    return { runId: run.runId };
  },
});
