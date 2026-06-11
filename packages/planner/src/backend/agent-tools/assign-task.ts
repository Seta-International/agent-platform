import {
  actorFromContext,
  defineAgentTool,
  recordEntityExposure,
  resolveTaskRef,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { assignTask } from '../domain/assign-task.ts';

export const plannerAssignTaskTool = defineAgentTool({
  id: 'planner_assignTask',
  name: 'Assign Task',
  description:
    'Canvas and workflow path only — do NOT call from the chat flow; ' +
    'use planner_proposeAssignment there instead.\n\n' +
    'Add one user as an additional assignee without affecting existing assignees.\n' +
    'Use only when the user explicitly wants to ADD a collaborator alongside current owners.\n' +
    'When the user says "assign to X" or "reassign to X", use planner_setAssignees instead.',
  input: z.object({
    taskRef: z
      .string()
      .trim()
      .min(1)
      .describe(
        'Task UUID, or an ordinal reference into your working memory `recentTasks` list: ' +
          '"#1" / "1" / "first" → most recent, "#2" / "second" → next, "last" → most recent. ' +
          'Prefer ordinals when the user is referring to something you just discussed.',
      ),
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
    const { taskId } = await resolveTaskRef(ctx as never, input.taskRef);

    await assignTask({
      task_id: taskId,
      user_id: input.assigneeUserId,
      session,
    });

    await recordEntityExposure(ctx as never, { lastDiscussedTaskId: taskId });

    return {
      assignment: {
        taskId,
        assigneeUserId: input.assigneeUserId,
      },
    };
  },
});
