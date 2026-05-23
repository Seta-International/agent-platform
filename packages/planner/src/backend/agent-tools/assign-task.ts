import { createTool } from '@mastra/core/tools';
import { actorFromContext, RequestContextSchema, registerToolPermission } from '@seta/copilot-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { assignTask } from '../domain/assign-task.ts';

export const plannerAssignTaskTool = registerToolPermission(
  createTool({
    id: 'planner_assignTask',
    description: 'Assign a user to a task.',
    inputSchema: z.object({
      taskId: z.string().uuid().describe('The task ID'),
      assigneeUserId: z.string().uuid().describe('The user ID to assign to the task'),
    }),
    outputSchema: z.object({
      assignment: z.object({
        taskId: z.string(),
        assigneeUserId: z.string(),
      }),
    }),
    requestContextSchema: RequestContextSchema,
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
  }),
  'planner.task.assign',
);
