import { createTool } from '@mastra/core/tools';
import { getPlan, getTask } from '@seta/planner';
import { z } from 'zod';
import { buildActorSession } from '../session.ts';
import { actorFromContext, RequestContextSchema, registerToolPermission } from './_types.ts';

export const plannerGetTaskTool = registerToolPermission(
  createTool({
    id: 'planner_getTask',
    description: 'Get a task by ID with its assignees, labels, and checklist summary.',
    inputSchema: z.object({
      taskId: z.string().uuid().describe('The task ID'),
    }),
    outputSchema: z.object({
      task: z.object({
        taskId: z.string(),
        tenantId: z.string(),
        groupId: z.string(),
        planId: z.string(),
        bucketId: z.string().nullable(),
        title: z.string(),
        description: z.string().nullable(),
        priority: z.enum(['urgent', 'important', 'medium', 'low']),
        progress: z.enum(['not_started', 'in_progress', 'completed', 'deferred']),
        reviewState: z.enum(['needs_review']).nullable(),
        skillTags: z.array(z.string()),
        dueAt: z.string().nullable(),
        sortOrder: z.number(),
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
      }),
    }),
    requestContextSchema: RequestContextSchema,
    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);
      const session = await buildActorSession(actor);

      const taskRow = await getTask({
        task_id: input.taskId,
        session,
      });

      const plan = await getPlan({
        plan_id: taskRow.plan_id,
        session,
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
          priority: taskRow.priority,
          progress: taskRow.progress,
          reviewState: taskRow.review_state,
          skillTags: taskRow.skill_tags,
          dueAt: taskRow.due_at,
          sortOrder: taskRow.sort_order,
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
        },
      };
    },
  }),
  'planner.task.read',
);
