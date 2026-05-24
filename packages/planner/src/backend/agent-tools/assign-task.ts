import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { assignTask } from '../domain/assign-task.ts';

export const plannerAssignTaskTool = defineCopilotTool({
  id: 'planner_assignTask',
  name: 'Assign Task',
  description: 'Assign a user to a task.',
  input: z.object({
    taskId: z.string().uuid().describe('The task ID'),
    assigneeUserId: z.string().uuid().describe('The user ID to assign to the task'),
  }),
  output: z.object({
    assignment: z.object({
      taskId: z.string(),
      assigneeUserId: z.string(),
    }),
  }),
  rbac: 'planner.task.assign',
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);

    await assignTask({
      task_id: input.taskId,
      user_id: input.assigneeUserId,
      session,
    });

    return {
      assignment: {
        taskId: input.taskId,
        assigneeUserId: input.assigneeUserId,
      },
    };
  },
});
