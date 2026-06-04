import {
  actorFromContext,
  defineAgentTool,
  getPendingAssignRunIdForTask,
  recordEntityExposure,
  resolveTaskRef,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { getPlan } from '../domain/get-plan.ts';
import { getTask } from '../domain/get-task.ts';

export const plannerGetTaskTool = defineAgentTool({
  id: 'planner_getTask',
  name: 'Look Up Task',
  description: 'Get a task by ID with its assignees, labels, and checklist summary.',
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
  }),
  output: z.object({
    task: z.object({
      taskId: z.string(),
      tenantId: z.string(),
      groupId: z.string(),
      planId: z.string(),
      bucketId: z.string().nullable(),
      title: z.string(),
      description: z.string().nullable(),
      priority: z.enum(['urgent', 'important', 'medium', 'low']),
      priorityNumber: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(9)]),
      progress: z.enum(['not_started', 'in_progress', 'completed', 'deferred']),
      percentComplete: z.number(),
      isDeferred: z.boolean(),
      reviewState: z.enum(['needs_review']).nullable(),
      skillTags: z.array(z.string()),
      dueAt: z.string().nullable(),
      orderHint: z.string().nullable(),
      createdBy: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      deletedAt: z.string().nullable(),
      version: z.number(),
      assignees: z.array(
        z.object({
          userId: z.string(),
          displayName: z.string(),
          email: z.string(),
          availabilityStatus: z.string(),
          oooUntil: z.string().nullable(),
          deactivatedAt: z.string().nullable(),
        }),
      ),
      labels: z.array(
        z.object({
          id: z.string(),
          tenantId: z.string(),
          planId: z.string(),
          name: z.string(),
          color: z.string(),
          createdAt: z.string(),
          deletedAt: z.string().nullable(),
        }),
      ),
      checklistSummary: z.object({
        total: z.number(),
        checked: z.number(),
      }),
      pendingAssignWorkflowRunId: z.string().uuid().nullable(),
    }),
  }),
  rbac: 'planner.task.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const { taskId } = await resolveTaskRef(ctx as never, input.taskRef);

    const [taskRow, pendingAssignWorkflowRunId] = await Promise.all([
      getTask({
        task_id: taskId,
        session,
      }),
      getPendingAssignRunIdForTask({
        taskId,
        tenantId: session.tenant_id,
      }),
    ]);

    const plan = await getPlan({
      plan_id: taskRow.plan_id,
      session,
    });

    const priorityLabel = ({ 1: 'urgent', 3: 'important', 5: 'medium', 9: 'low' } as const)[
      taskRow.priority_number
    ];
    const progress: 'not_started' | 'in_progress' | 'completed' | 'deferred' = taskRow.is_deferred
      ? 'deferred'
      : taskRow.percent_complete >= 100
        ? 'completed'
        : taskRow.percent_complete > 0
          ? 'in_progress'
          : 'not_started';

    await recordEntityExposure(ctx as never, {
      recentTasks: [{ taskId: taskRow.id, title: taskRow.title }],
      lastDiscussedTaskId: taskRow.id,
    });

    return {
      task: {
        taskId: taskRow.id,
        tenantId: taskRow.tenant_id,
        groupId: plan.group_id,
        planId: taskRow.plan_id,
        bucketId: taskRow.bucket_id,
        title: taskRow.title,
        description: taskRow.description,
        priority: priorityLabel,
        priorityNumber: taskRow.priority_number,
        progress,
        percentComplete: taskRow.percent_complete,
        isDeferred: taskRow.is_deferred,
        reviewState: taskRow.review_state,
        skillTags: taskRow.skill_tags,
        dueAt: taskRow.due_at,
        orderHint: taskRow.order_hint,
        createdBy: taskRow.created_by,
        createdAt: taskRow.created_at,
        updatedAt: taskRow.updated_at,
        deletedAt: taskRow.deleted_at,
        version: taskRow.version,
        assignees: taskRow.assignees.map((a) => ({
          userId: a.user_id,
          displayName: a.display_name,
          email: a.email,
          availabilityStatus: a.availability_status,
          oooUntil: a.ooo_until,
          deactivatedAt: a.deactivated_at,
        })),
        labels: taskRow.labels.map((l) => ({
          id: l.id,
          tenantId: l.tenant_id,
          planId: l.plan_id,
          name: l.name,
          color: l.color,
          createdAt: l.created_at,
          deletedAt: l.deleted_at,
        })),
        checklistSummary: taskRow.checklist_summary,
        pendingAssignWorkflowRunId,
      },
    };
  },
});
