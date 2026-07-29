import {
  actorFromContext,
  daysUntilDue,
  defineAgentTool,
  getPendingAssignRunIdForTask,
  isOverdue,
  recordEntityExposure,
  resolveTaskRef,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection, buckets, groups } from '../db/schema.ts';
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
      groupId: z.string(),
      groupName: z.string(),
      planId: z.string(),
      planName: z.string(),
      bucketId: z.string().nullable(),
      bucketName: z.string().nullable(),
      title: z.string(),
      description: z.string().nullable(),
      priority: z.enum(['urgent', 'important', 'medium', 'low']),
      priorityNumber: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(9)]),
      progress: z.enum(['not_started', 'in_progress', 'completed', 'deferred']),
      percentComplete: z.number(),
      isDeferred: z.boolean(),
      reviewState: z.enum(['needs_review']).nullable(),
      dueAt: z.string().nullable(),
      isOverdue: z
        .boolean()
        .describe(
          'Server-computed in Asia/Ho_Chi_Minh: true when the due date has passed. ' +
            'Use THIS to decide whether a task is late — never compare dates yourself.',
        ),
      daysUntilDue: z
        .number()
        .nullable()
        .describe(
          'Server-computed whole local calendar days until due. 0 = due today, ' +
            'negative = overdue, null = no due date.',
        ),
      createdBy: z.string(),
      createdByName: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
      deletedAt: z.string().nullable(),
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
          name: z.string(),
          color: z.string(),
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

    const db = plannerDb();
    const [bucketRow, groupRow, creatorRow] = await Promise.all([
      taskRow.bucket_id
        ? db
            .select({ name: buckets.name })
            .from(buckets)
            .where(eq(buckets.id, taskRow.bucket_id))
            .limit(1)
            .then((r) => r[0] ?? null)
        : Promise.resolve(null),
      db
        .select({ name: groups.name })
        .from(groups)
        .where(eq(groups.id, plan.group_id))
        .limit(1)
        .then((r) => r[0] ?? null),
      db
        .select({ display_name: assigneeProjection.display_name })
        .from(assigneeProjection)
        .where(eq(assigneeProjection.user_id, taskRow.created_by))
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);

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
        groupId: plan.group_id,
        groupName: groupRow?.name ?? plan.group_id,
        planId: taskRow.plan_id,
        planName: plan.name,
        bucketId: taskRow.bucket_id,
        bucketName: bucketRow?.name ?? null,
        title: taskRow.title,
        description: taskRow.description,
        priority: priorityLabel,
        priorityNumber: taskRow.priority_number,
        progress,
        percentComplete: taskRow.percent_complete,
        isDeferred: taskRow.is_deferred,
        reviewState: taskRow.review_state,
        dueAt: taskRow.due_at,
        isOverdue: isOverdue(taskRow.due_at),
        daysUntilDue: daysUntilDue(taskRow.due_at),
        createdBy: taskRow.created_by,
        createdByName: creatorRow?.display_name ?? null,
        createdAt: taskRow.created_at,
        updatedAt: taskRow.updated_at,
        deletedAt: taskRow.deleted_at,
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
          name: l.name,
          color: l.color,
        })),
        checklistSummary: taskRow.checklist_summary,
        pendingAssignWorkflowRunId,
      },
    };
  },
});
