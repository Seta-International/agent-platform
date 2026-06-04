import {
  actorFromContext,
  defineAgentTool,
  recordEntityExposure,
  resolveTaskRef,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { setAssignees } from '../domain/set-assignees.ts';

export const plannerSetAssigneesTool = defineAgentTool({
  id: 'planner_setAssignees',
  name: 'Set Task Assignees',
  description:
    'Replace the complete assignee list for a task. ' +
    'Use when the user says "assign to X" (meaning X should be the sole or primary assignee) ' +
    'or "assign to X and Y" (replacing whoever is currently assigned). ' +
    'Prefer this over planner_assignTask whenever the intent is to set who owns the task, ' +
    'not just to add a collaborator alongside existing assignees.',
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
    assigneeUserIds: z
      .array(z.string().uuid())
      .min(1)
      .describe('Complete list of user IDs that should be assigned after this operation'),
  }),
  output: z.object({
    taskId: z.string(),
    assigneeUserIds: z.array(z.string()),
  }),
  rbac: 'planner.task.assign',
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const { taskId } = await resolveTaskRef(ctx as never, input.taskRef);

    await setAssignees({
      task_id: taskId,
      user_ids: input.assigneeUserIds,
      session,
    });

    await recordEntityExposure(ctx as never, { lastDiscussedTaskId: taskId });

    return {
      taskId,
      assigneeUserIds: input.assigneeUserIds,
    };
  },
});
