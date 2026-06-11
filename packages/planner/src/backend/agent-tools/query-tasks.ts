import { actorFromContext, defineAgentTool, recordEntityExposure } from '@seta/agent-sdk';
import type { SessionScope } from '@seta/core';
import { buildActorSession } from '@seta/identity';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { plannerDb } from '../db/index.ts';
import { plans } from '../db/schema.ts';
import { listTasks } from '../domain/list-tasks.ts';

// ─── domain helper (exported for testing) ──────────────────────────────────

export interface QueryTasksInput {
  assigneeUserId?: string;
  planId?: string;
  groupId?: string;
  bucketId?: string;
  status?: 'open' | 'completed' | 'any';
  reviewState?: 'needs_review';
  skillTags?: string[];
  isDeferred?: boolean;
  dueBefore?: string;
  limit?: number;
  cursor?: string;
  session: SessionScope;
}

export interface QueryTaskItem {
  taskId: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'deferred';
  priority: 'urgent' | 'important' | 'medium' | 'low';
  dueAt: string | null;
  skillTags: string[];
  reviewState: 'needs_review' | null;
  assigneeUserIds: string[];
  planId: string;
  groupId: string;
  bucketId: string | null;
}

export interface QueryTasksResult {
  tasks: QueryTaskItem[];
  nextCursor: string | null;
}

const PRIORITY_MAP = { 1: 'urgent', 3: 'important', 5: 'medium', 9: 'low' } as const;

function deriveStatus(percentComplete: number, isDeferred: boolean): QueryTaskItem['status'] {
  if (percentComplete >= 100) return 'completed';
  if (isDeferred) return 'deferred';
  if (percentComplete > 0) return 'in_progress';
  return 'not_started';
}

export async function queryTasks(input: QueryTasksInput): Promise<QueryTasksResult> {
  const { session } = input;
  const status = input.status ?? 'open';

  const filters: Parameters<typeof listTasks>[0]['filters'] = {};

  if (input.assigneeUserId !== undefined) filters.assignee_id = input.assigneeUserId;
  if (input.planId !== undefined) filters.plan_id = input.planId;
  if (input.groupId !== undefined) filters.group_id = input.groupId;
  if (input.bucketId !== undefined) filters.bucket_id = input.bucketId;
  if (input.reviewState !== undefined) filters.review_state = input.reviewState;
  if (input.skillTags !== undefined && input.skillTags.length > 0) {
    filters.skill_tags = input.skillTags;
  }
  if (input.isDeferred !== undefined) filters.is_deferred = input.isDeferred;
  if (input.dueBefore !== undefined) filters.due_before = input.dueBefore;

  if (status === 'open') filters.percent_complete_lt = 100;
  else if (status === 'completed') filters.percent_complete_gte = 100;
  // 'any' → no percent filter

  const raw = await listTasks({
    filters,
    limit: input.limit ?? 20,
    cursor: input.cursor,
    session,
  });

  // Batch-fetch group_id for all unique plan_ids in this result.
  const uniquePlanIds = [...new Set(raw.tasks.map((t) => t.plan_id))];
  const planRows =
    uniquePlanIds.length > 0
      ? await plannerDb()
          .select({ id: plans.id, group_id: plans.group_id })
          .from(plans)
          .where(inArray(plans.id, uniquePlanIds))
      : [];
  const groupByPlan = new Map(planRows.map((r) => [r.id, r.group_id]));

  const tasks: QueryTaskItem[] = raw.tasks.map((t) => ({
    taskId: t.id,
    title: t.title,
    status: deriveStatus(t.percent_complete, t.is_deferred),
    priority: PRIORITY_MAP[t.priority_number as keyof typeof PRIORITY_MAP] ?? 'medium',
    dueAt: t.due_at ?? null,
    skillTags: t.skill_tags ?? [],
    reviewState: t.review_state ?? null,
    assigneeUserIds: (t.assignees ?? []).map((a) => a.user_id),
    planId: t.plan_id,
    groupId: groupByPlan.get(t.plan_id) ?? '',
    bucketId: t.bucket_id ?? null,
  }));

  return {
    tasks,
    nextCursor: raw.next_cursor ?? null,
  };
}

// ─── Zod schemas ────────────────────────────────────────────────────────────

const inputSchema = z.object({
  assigneeUserId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'UUID of the user whose tasks to list. ' +
        'Get from identity_whoAmI, identity_matchUsersByTopic, or planner_searchGroupMembersBySkills.',
    ),
  planId: z.string().uuid().optional().describe('Restrict to tasks in this plan.'),
  groupId: z
    .string()
    .uuid()
    .optional()
    .describe('Restrict to tasks in plans belonging to this group.'),
  bucketId: z.string().uuid().optional().describe('Restrict to tasks in this bucket.'),
  status: z
    .enum(['open', 'completed', 'any'])
    .default('open')
    .describe('"open" = incomplete only (default). "completed" = 100% done. "any" = all statuses.'),
  reviewState: z
    .enum(['needs_review'])
    .optional()
    .describe('Set to "needs_review" to return only tasks flagged for review.'),
  skillTags: z
    .array(z.string())
    .optional()
    .describe('Return only tasks whose skill_tags include all of these values.'),
  isDeferred: z
    .boolean()
    .optional()
    .describe('true = deferred tasks only. false = exclude deferred. omit = all.'),
  dueBefore: z
    .string()
    .optional()
    .describe('ISO-8601 date. Return tasks with due_at before this date. E.g. "2026-06-30".'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe('Maximum tasks to return. Default 20.'),
  cursor: z
    .string()
    .optional()
    .describe('Pagination cursor from a previous call. Omit for first page.'),
});

const taskItemSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'deferred']),
  priority: z.enum(['urgent', 'important', 'medium', 'low']),
  dueAt: z.string().nullable(),
  skillTags: z.array(z.string()),
  reviewState: z.enum(['needs_review']).nullable(),
  assigneeUserIds: z.array(z.string()),
  planId: z.string(),
  groupId: z.string(),
  bucketId: z.string().nullable(),
});

const outputSchema = z.object({
  tasks: z.array(taskItemSchema),
  nextCursor: z
    .string()
    .nullable()
    .describe('Pass as `cursor` in the next call to get the following page. null = no more pages.'),
});

// ─── Agent tool ─────────────────────────────────────────────────────────────

export const plannerQueryTasksTool = defineAgentTool({
  id: 'planner_queryTasks',
  name: 'Query Tasks',
  description:
    'Find tasks matching structured filter criteria — by assignee, plan, group, bucket, ' +
    'status, skill tags, review state, or due date.\n\n' +
    'Use for: "find Tuấn\'s open tasks"; "what\'s overdue in plan X"; "show tasks tagged ' +
    'docker that need review"; "list deferred tasks in group Y".\n' +
    'Do NOT use for topic or keyword discovery — use planner_findSimilarTasks instead.\n\n' +
    'At least one filter must be set. status defaults to "open". ' +
    'assigneeUserId must be a UUID from a profile lookup or search result.',
  input: inputSchema,
  output: outputSchema,
  rbac: 'planner.task.read.tenant',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);

    const result = await queryTasks({ ...input, session });

    if (result.tasks.length > 0) {
      await recordEntityExposure(ctx as never, {
        recentTasks: result.tasks.map((t) => ({ taskId: t.taskId, title: t.title })),
      });
    }

    return result;
  },
});
