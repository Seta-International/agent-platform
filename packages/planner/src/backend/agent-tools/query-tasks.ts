import {
  actorFromContext,
  daysUntilDue,
  defineAgentTool,
  isOverdue,
  recordEntityExposure,
} from '@seta/agent-sdk';
import type { SessionScope } from '@seta/core';
import { buildActorSession } from '@seta/identity';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { plannerDb } from '../db/index.ts';
import { labels, plans, taskLabels } from '../db/schema.ts';
import { listTasks } from '../domain/list-tasks.ts';
import { hasVisibleActiveGroups } from '../read-helpers.ts';
import { archivedGroupError, resolveGroupScope, withScopeError } from './resolve-scope.ts';

// ─── domain helper (exported for testing) ──────────────────────────────────

/**
 * Lifecycle status, derived entirely from `percent_complete` (DB buckets: 0, 50, 100).
 * Ranges (not exact equality) keep the filter robust if intermediate values ever appear.
 */
export type QueryTaskStatus = 'open' | 'not_started' | 'in_progress' | 'completed' | 'any';

export interface QueryTasksInput {
  assigneeUserId?: string;
  planId?: string;
  groupId?: string;
  bucketId?: string;
  status?: QueryTaskStatus;
  isDeferred?: boolean;
  dueBefore?: string;
  titleContains?: string;
  limit?: number;
  cursor?: string;
  /** Set only when the user explicitly asked for archived groups (FUT-832 AC4). */
  includeArchived?: boolean;
  /** Injectable clock for deterministic lateness in tests and evals. */
  now?: Date;
  session: SessionScope;
}

/**
 * Map a lifecycle status to percent_complete bounds. Composed from the domain's
 * `_lt` / `_gte` conditions — no exact-match filter needed.
 */
export function statusToPercentFilters(status: QueryTaskStatus): {
  percent_complete_lt?: number;
  percent_complete_gte?: number;
} {
  switch (status) {
    case 'open':
      return { percent_complete_lt: 100 };
    case 'not_started':
      return { percent_complete_lt: 50 };
    case 'in_progress':
      return { percent_complete_gte: 50, percent_complete_lt: 100 };
    case 'completed':
      return { percent_complete_gte: 100 };
    case 'any':
      return {};
  }
}

/**
 * Server-authoritative assignee resolution for the LLM tool. When the model asks
 * for "my tasks" it sets assigneeScope: 'me' and the caller's id is taken from the
 * authenticated session — the model never supplies its own UUID (anti-injection).
 */
export function resolveQueryAssignee(
  actor: { user_id: string },
  input: { assigneeScope?: 'me'; assigneeUserId?: string },
): string | undefined {
  if (input.assigneeScope === 'me') return actor.user_id;
  return input.assigneeUserId;
}

export interface QueryTaskItem {
  taskId: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'deferred';
  priority: 'urgent' | 'important' | 'medium' | 'low';
  dueAt: string | null;
  /** Server-computed: the due instant has passed. Never recomputed by the model. */
  isOverdue: boolean;
  /** Server-computed local calendar days to due; 0 = today, negative = past. */
  daysUntilDue: number | null;
  labels: string[];
  assigneeUserIds: string[];
  planId: string;
  groupId: string;
  bucketId: string | null;
}

export interface QueryTasksResult {
  tasks: QueryTaskItem[];
  nextCursor: string | null;
  /** True when archived groups contributed to this page — the answer must say so. */
  includedArchivedGroups: boolean;
  /** True when the caller has no live group left, so an empty page is not "no matches". */
  noActiveGroups: boolean;
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

  const filters: Parameters<typeof listTasks>[0]['filters'] = {
    ...statusToPercentFilters(status),
  };

  if (input.assigneeUserId !== undefined) filters.assignee_id = input.assigneeUserId;
  if (input.planId !== undefined) filters.plan_id = input.planId;
  if (input.groupId !== undefined) filters.group_id = input.groupId;
  if (input.bucketId !== undefined) filters.bucket_id = input.bucketId;
  if (input.isDeferred !== undefined) filters.is_deferred = input.isDeferred;
  if (input.dueBefore !== undefined) filters.due_before = input.dueBefore;
  if (input.titleContains !== undefined) filters.title_contains = input.titleContains;
  if (input.includeArchived) filters.include_archived_groups = true;

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

  // Batch-fetch applied label names (a task's skills) for all tasks in this result.
  const taskIds = raw.tasks.map((t) => t.id);
  const labelRows =
    taskIds.length > 0
      ? await plannerDb()
          .select({ task_id: taskLabels.task_id, name: labels.name })
          .from(taskLabels)
          .innerJoin(labels, eq(labels.id, taskLabels.label_id))
          .where(and(inArray(taskLabels.task_id, taskIds), isNull(labels.deleted_at)))
      : [];
  const labelsByTask = new Map<string, string[]>();
  for (const r of labelRows) {
    const arr = labelsByTask.get(r.task_id) ?? [];
    arr.push(r.name);
    labelsByTask.set(r.task_id, arr);
  }

  // Captured once so every row on a page is judged against the same instant.
  const now = input.now ?? new Date();
  const tasks: QueryTaskItem[] = raw.tasks.map((t) => ({
    taskId: t.id,
    title: t.title,
    status: deriveStatus(t.percent_complete, t.is_deferred),
    priority: PRIORITY_MAP[t.priority_number as keyof typeof PRIORITY_MAP] ?? 'medium',
    dueAt: t.due_at ?? null,
    isOverdue: isOverdue(t.due_at, now),
    daysUntilDue: daysUntilDue(t.due_at, now),
    labels: labelsByTask.get(t.id) ?? [],
    assigneeUserIds: (t.assignees ?? []).map((a) => a.user_id),
    planId: t.plan_id,
    groupId: groupByPlan.get(t.plan_id) ?? '',
    bucketId: t.bucket_id ?? null,
  }));

  return {
    tasks,
    nextCursor: raw.next_cursor ?? null,
    includedArchivedGroups: input.includeArchived === true,
    noActiveGroups: tasks.length === 0 ? !(await hasVisibleActiveGroups(session)) : false,
  };
}

// ─── Zod schemas ────────────────────────────────────────────────────────────

const inputSchema = z.object({
  assigneeScope: z
    .enum(['me'])
    .optional()
    .describe(
      "Set to 'me' to list the CURRENT user's tasks. The caller's identity comes from " +
        'the session — do NOT pass assigneeUserId for yourself, and never invent a UUID.',
    ),
  assigneeUserId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'UUID of ANOTHER user whose tasks to list. For yourself use assigneeScope: "me" instead. ' +
        "Obtain another user's UUID from planner_resolveMember — never guess it.",
    ),
  planId: z.string().uuid().optional().describe('Restrict to tasks in this plan.'),
  groupId: z
    .string()
    .uuid()
    .optional()
    .describe('Group UUID. Optional if groupName provided or user has exactly one group.'),
  groupName: z
    .string()
    .optional()
    .describe('Group name (case-insensitive substring match). Resolves to groupId automatically.'),
  bucketId: z.string().uuid().optional().describe('Restrict to tasks in this bucket.'),
  status: z
    .enum(['open', 'not_started', 'in_progress', 'completed', 'any'])
    .default('open')
    .describe(
      'Lifecycle filter on percent_complete. "open" = not done, percent < 100 (default). ' +
        '"not_started" = percent < 50 (not begun). "in_progress" = started but not done ' +
        '(50 ≤ percent < 100). "completed" = percent ≥ 100. "any" = all statuses. ' +
        'Use "open" for general "my tasks" questions.',
    ),
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
  titleContains: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Case-insensitive substring match on task title. ' +
        'Use for: "find the billing migration task"; "task named FUT-396". ' +
        'Do NOT use for topic/semantic discovery — use planner_findSimilarTasks instead.',
    ),
  cursor: z
    .string()
    .optional()
    .describe('Pagination cursor from a previous call. Omit for first page.'),
  includeArchived: z
    .boolean()
    .default(false)
    .describe(
      'Set true ONLY when the user explicitly asked to include archived groups ' +
        '("including archived", "even the archived ones"). Default false — archived groups ' +
        'are outside active work and must not leak into a general answer.',
    ),
});

const taskItemSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'deferred']),
  priority: z.enum(['urgent', 'important', 'medium', 'low']),
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
  labels: z.array(z.string()),
  assigneeUserIds: z.array(z.string()),
  planId: z.string(),
  groupId: z.string(),
  bucketId: z.string().nullable(),
});

const outputSchema = withScopeError(
  z.object({
    tasks: z.array(taskItemSchema),
    nextCursor: z
      .string()
      .nullable()
      .describe(
        'Pass as `cursor` in the next call to get the following page. null = no more pages.',
      ),
    includedArchivedGroups: z
      .boolean()
      .describe(
        'True when archived groups contributed to this result. The answer MUST state that ' +
          'archived groups are included.',
      ),
    noActiveGroups: z
      .boolean()
      .describe(
        'True when the user belongs to no active group — every group they had is archived. ' +
          'An empty tasks list then means exactly that: say the user has no active groups ' +
          'instead of reporting that no tasks were found.',
      ),
  }),
);

// ─── Agent tool ─────────────────────────────────────────────────────────────

export const plannerQueryTasksTool = defineAgentTool({
  id: 'planner_queryTasks',
  name: 'Query Tasks',
  description:
    'Find tasks matching structured filter criteria — by title, assignee, plan, group, bucket, ' +
    'status (lifecycle via percent_complete), or due date.\n\n' +
    'Resolves groupId automatically: provide groupName for name-based lookup, or omit both ' +
    'to auto-resolve when the user belongs to exactly one group.\n\n' +
    'Use for: "find Tuấn\'s open tasks"; "task named billing migration"; "what\'s overdue in plan X"; ' +
    '"list deferred tasks in group Y". Each result includes its applied labels.\n' +
    'Each result carries isOverdue and daysUntilDue, computed on the server in Vietnam time — ' +
    'read those fields for lateness instead of comparing dates.\n' +
    'Do NOT use for topic or keyword discovery — use planner_findSimilarTasks instead.\n\n' +
    'At least one filter must be set. status defaults to "open" (percent < 100). For the current ' +
    'user pass assigneeScope: "me"; for another user pass assigneeUserId (a UUID from a lookup). ' +
    'Apply optional filters (dueBefore, isDeferred, titleContains) ONLY when the user explicitly ' +
    'asks for that subset — adding them to a general query wrongly hides most tasks.',
  input: inputSchema,
  output: outputSchema,
  rbac: 'planner.reporting.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);

    let groupId = input.groupId;
    if (groupId || input.groupName) {
      const resolved = await resolveGroupScope(session, {
        groupId,
        groupName: input.groupName,
      });
      if ('notFound' in resolved) {
        return {
          tasks: [],
          nextCursor: null,
          includedArchivedGroups: false,
          noActiveGroups: false,
        } as QueryTasksResult;
      }
      if ('ambiguous' in resolved) {
        const names = resolved.options.map((o) => o.name).join(', ');
        return { error: `Multiple groups found: ${names}. Please specify which one.` };
      }
      if ('archived' in resolved && !input.includeArchived) {
        return { error: archivedGroupError(resolved.name) };
      }
      groupId = resolved.id;
    }

    const assigneeUserId = resolveQueryAssignee(actor, input);
    const result = await queryTasks({ ...input, assigneeUserId, groupId, session });

    if (result.tasks.length > 0) {
      await recordEntityExposure(ctx as never, {
        recentTasks: result.tasks.map((t) => ({ taskId: t.taskId, title: t.title })),
      });
    }

    return result;
  },
});
