import type { SessionEnv } from '@seta/core';
import type { ListTasksFilters } from '@seta/planner';
import {
  addChecklistItem,
  applyLabel,
  assignTask,
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listChecklistItems,
  listMyAssignedTasks,
  listTaskEvents,
  listTasks,
  moveTask,
  removeChecklistItem,
  reopenTask,
  restoreTask,
  unapplyLabel,
  unassignTask,
  updateChecklistItem,
  updateTask,
} from '@seta/planner';
import type { Hono } from 'hono';
import { z } from 'zod';

const createTaskSchema = z.object({
  plan_id: z.string().uuid(),
  bucket_id: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  priority: z.enum(['urgent', 'important', 'medium', 'low']).optional(),
  due_at: z.string().optional(),
  skill_tags: z.array(z.string()).optional(),
  review_state: z.literal('needs_review').optional(),
});

const updateTaskSchema = z.object({
  expected_version: z.number().int().positive(),
  patch: z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    priority: z.enum(['urgent', 'important', 'medium', 'low']).optional(),
    due_at: z.string().nullable().optional(),
    skill_tags: z.array(z.string()).optional(),
    review_state: z.literal('needs_review').nullable().optional(),
  }),
});

const moveTaskSchema = z.object({
  expected_version: z.number().int().positive(),
  to_bucket_id: z.string().uuid().nullable(),
  after_task_id: z.string().uuid().optional(),
});

const versionSchema = z.object({ expected_version: z.number().int().positive() });

const assignSchema = z.object({ user_id: z.string().uuid() });

const applyLabelSchema = z.object({ label_id: z.string().uuid() });

const addChecklistItemSchema = z.object({
  label: z.string().min(1).max(500),
  after_item_id: z.string().uuid().optional(),
});

const updateChecklistItemSchema = z.object({
  patch: z.object({
    label: z.string().min(1).max(500).optional(),
    checked: z.boolean().optional(),
  }),
});

function parseListTasksQuery(query: Record<string, string | undefined>): {
  filters: ListTasksFilters;
  limit: number;
  cursor: string | undefined;
} {
  const filters: ListTasksFilters = {};

  if (query.plan_id) filters.plan_id = query.plan_id;
  if (query.group_id) filters.group_id = query.group_id;
  if (query.bucket_id) filters.bucket_id = query.bucket_id;
  if (query.assignee_id) filters.assignee_id = query.assignee_id;
  if (query.review_state === 'needs_review') filters.review_state = 'needs_review';
  if (
    query.progress === 'not_started' ||
    query.progress === 'in_progress' ||
    query.progress === 'completed' ||
    query.progress === 'deferred'
  ) {
    filters.progress = query.progress;
  }
  if (query.due_before) filters.due_before = query.due_before;
  if (query.skill_tags) filters.skill_tags = query.skill_tags.split(',').filter(Boolean);
  if (query.include_deleted === 'true') filters.include_deleted = true;

  const rawLimit = Number.parseInt(query.limit ?? '50', 10);
  const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 200);
  const cursor = query.cursor ?? undefined;

  return { filters, limit, cursor };
}

export function registerPlannerTasksRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/planner/v1/tasks', async (c) => {
    const session = c.get('user');
    const { filters, limit, cursor } = parseListTasksQuery(c.req.query());
    return c.json(await listTasks({ filters, limit, cursor, session }));
  });

  app.get('/api/planner/v1/tasks/mine', async (c) => {
    const session = c.get('user');
    const q = c.req.query();
    const filters: Parameters<typeof listMyAssignedTasks>[0]['filters'] = {};
    if (q.review_state === 'needs_review') filters.review_state = 'needs_review';
    if (
      q.progress === 'not_started' ||
      q.progress === 'in_progress' ||
      q.progress === 'completed' ||
      q.progress === 'deferred'
    ) {
      filters.progress = q.progress;
    }
    if (q.due_before) filters.due_before = q.due_before;
    if (q.include_deleted === 'true') filters.include_deleted = true;

    const rawLimit = Number.parseInt(q.limit ?? '50', 10);
    const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 200);
    const cursor = q.cursor ?? undefined;

    return c.json(await listMyAssignedTasks({ filters, limit, cursor, session }));
  });

  app.get('/api/planner/v1/tasks/:id', async (c) => {
    const session = c.get('user');
    return c.json(await getTask({ task_id: c.req.param('id'), session }));
  });

  app.post('/api/planner/v1/tasks', async (c) => {
    const session = c.get('user');
    const parsed = createTaskSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await createTask({ ...parsed.data, session }), 201);
  });

  app.patch('/api/planner/v1/tasks/:id', async (c) => {
    const session = c.get('user');
    const parsed = updateTaskSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await updateTask({
        task_id: c.req.param('id'),
        expected_version: parsed.data.expected_version,
        patch: parsed.data.patch,
        session,
      }),
    );
  });

  app.post('/api/planner/v1/tasks/:id/move', async (c) => {
    const session = c.get('user');
    const parsed = moveTaskSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await moveTask({
        task_id: c.req.param('id'),
        expected_version: parsed.data.expected_version,
        to_bucket_id: parsed.data.to_bucket_id,
        after_task_id: parsed.data.after_task_id,
        session,
      }),
    );
  });

  app.post('/api/planner/v1/tasks/:id/assign', async (c) => {
    const session = c.get('user');
    const parsed = assignSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await assignTask({ task_id: c.req.param('id'), user_id: parsed.data.user_id, session });
    return c.body(null, 204);
  });

  app.delete('/api/planner/v1/tasks/:id/assignees/:userId', async (c) => {
    const session = c.get('user');
    await unassignTask({
      task_id: c.req.param('id'),
      user_id: c.req.param('userId'),
      session,
    });
    return c.body(null, 204);
  });

  app.post('/api/planner/v1/tasks/:id/complete', async (c) => {
    const session = c.get('user');
    const parsed = versionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await completeTask({
        task_id: c.req.param('id'),
        expected_version: parsed.data.expected_version,
        session,
      }),
    );
  });

  app.post('/api/planner/v1/tasks/:id/reopen', async (c) => {
    const session = c.get('user');
    const parsed = versionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await reopenTask({
        task_id: c.req.param('id'),
        expected_version: parsed.data.expected_version,
        session,
      }),
    );
  });

  app.delete('/api/planner/v1/tasks/:id', async (c) => {
    const session = c.get('user');
    const parsed = versionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await deleteTask({
      task_id: c.req.param('id'),
      expected_version: parsed.data.expected_version,
      session,
    });
    return c.body(null, 204);
  });

  app.post('/api/planner/v1/tasks/:id/restore', async (c) => {
    const session = c.get('user');
    return c.json(await restoreTask({ task_id: c.req.param('id'), session }));
  });

  app.post('/api/planner/v1/tasks/:id/labels', async (c) => {
    const session = c.get('user');
    const parsed = applyLabelSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await applyLabel({ task_id: c.req.param('id'), label_id: parsed.data.label_id, session });
    return c.body(null, 204);
  });

  app.delete('/api/planner/v1/tasks/:id/labels/:labelId', async (c) => {
    const session = c.get('user');
    await unapplyLabel({
      task_id: c.req.param('id'),
      label_id: c.req.param('labelId'),
      session,
    });
    return c.body(null, 204);
  });

  app.get('/api/planner/v1/tasks/:id/checklist', async (c) => {
    const session = c.get('user');
    return c.json({
      items: await listChecklistItems({ task_id: c.req.param('id'), session }),
    });
  });

  app.post('/api/planner/v1/tasks/:id/checklist', async (c) => {
    const session = c.get('user');
    const parsed = addChecklistItemSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await addChecklistItem({
        task_id: c.req.param('id'),
        label: parsed.data.label,
        after_item_id: parsed.data.after_item_id,
        session,
      }),
      201,
    );
  });

  app.patch('/api/planner/v1/checklist-items/:id', async (c) => {
    const session = c.get('user');
    const parsed = updateChecklistItemSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await updateChecklistItem({
        item_id: c.req.param('id'),
        patch: parsed.data.patch,
        session,
      }),
    );
  });

  app.delete('/api/planner/v1/checklist-items/:id', async (c) => {
    const session = c.get('user');
    await removeChecklistItem({ item_id: c.req.param('id'), session });
    return c.body(null, 204);
  });

  app.get('/api/planner/v1/tasks/:id/events', async (c) => {
    const session = c.get('user');
    const q = c.req.query();
    const rawLimit = q.limit ? Number.parseInt(q.limit, 10) : undefined;
    const limit = rawLimit !== undefined && !Number.isNaN(rawLimit) ? rawLimit : undefined;
    const result = await listTaskEvents({
      task_id: c.req.param('id'),
      session,
      limit,
      cursor: q.cursor ?? undefined,
    });
    return c.json({
      events: result.events.map((e) => ({
        id: e.id,
        event_type: e.event_type,
        event_version: e.event_version,
        aggregate_type: e.aggregate_type,
        aggregate_id: e.aggregate_id,
        tenant_id: e.tenant_id,
        trace_id: e.trace_id,
        caused_by_event_id: e.caused_by_event_id,
        occurred_at: e.occurred_at.toISOString(),
        payload: e.payload,
      })),
      next_cursor: result.next_cursor,
    });
  });
}
