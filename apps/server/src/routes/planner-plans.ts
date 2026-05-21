import type { SessionEnv } from '@seta/core';
import {
  countTasksByCategorySlot,
  createLabel,
  createPlan,
  deleteLabel,
  deletePlan,
  getPlan,
  listLabels,
  listPlans,
  restorePlan,
  setCategoryDescriptions,
  updateLabel,
  updatePlan,
} from '@seta/planner';
import type { Hono } from 'hono';
import { z } from 'zod';

const createSchema = z.object({
  group_id: z.string().uuid(),
  name: z.string().min(1).max(120),
});
const updateSchema = z.object({
  expected_version: z.number().int().positive(),
  patch: z.object({ name: z.string().min(1).max(120).optional() }),
});
const versionSchema = z.object({ expected_version: z.number().int().positive() });
const createLabelSchema = z.object({
  name: z.string().min(1).max(120),
  color: z.string().min(1).max(50),
});
const updateLabelSchema = z.object({
  patch: z.object({
    name: z.string().min(1).max(120).optional(),
    color: z.string().min(1).max(50).optional(),
  }),
});

const setCategoriesSchema = z.object({
  slots: z.record(
    z.string().regex(/^(?:[1-9]|1\d|2[0-5])$/),
    z.object({
      // Absent: leave the description unchanged. null: clear. string: set.
      name: z.string().max(100).nullable().optional(),
      // Absent: leave the label binding unchanged. null: detach. uuid: attach.
      label_id: z.string().uuid().nullable().optional(),
    }),
  ),
});

export function registerPlannerPlansRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/planner/v1/plans', async (c) => {
    const session = c.get('user');
    const group_id = c.req.query('group_id') ?? undefined;
    const include_deleted = c.req.query('include_deleted') === 'true';
    return c.json({ plans: await listPlans({ group_id, include_deleted, session }) });
  });

  app.get('/api/planner/v1/plans/:id', async (c) => {
    const session = c.get('user');
    return c.json(await getPlan({ plan_id: c.req.param('id'), session }));
  });

  app.post('/api/planner/v1/plans', async (c) => {
    const session = c.get('user');
    const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await createPlan({ group_id: parsed.data.group_id, name: parsed.data.name, session }),
      201,
    );
  });

  app.patch('/api/planner/v1/plans/:id', async (c) => {
    const session = c.get('user');
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await updatePlan({
        plan_id: c.req.param('id'),
        expected_version: parsed.data.expected_version,
        patch: parsed.data.patch,
        session,
      }),
    );
  });

  app.delete('/api/planner/v1/plans/:id', async (c) => {
    const session = c.get('user');
    const parsed = versionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await deletePlan({
      plan_id: c.req.param('id'),
      expected_version: parsed.data.expected_version,
      session,
    });
    return c.body(null, 204);
  });

  app.post('/api/planner/v1/plans/:id/restore', async (c) => {
    const session = c.get('user');
    return c.json(await restorePlan({ plan_id: c.req.param('id'), session }));
  });

  app.get('/api/planner/v1/plans/:id/labels', async (c) => {
    const session = c.get('user');
    const include_deleted = c.req.query('include_deleted') === 'true';
    return c.json({
      labels: await listLabels({ plan_id: c.req.param('id'), include_deleted, session }),
    });
  });

  app.post('/api/planner/v1/plans/:id/labels', async (c) => {
    const session = c.get('user');
    const parsed = createLabelSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await createLabel({
        plan_id: c.req.param('id'),
        name: parsed.data.name,
        color: parsed.data.color,
        session,
      }),
      201,
    );
  });

  app.patch('/api/planner/v1/labels/:id', async (c) => {
    const session = c.get('user');
    const parsed = updateLabelSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await updateLabel({ label_id: c.req.param('id'), patch: parsed.data.patch, session }),
    );
  });

  app.delete('/api/planner/v1/labels/:id', async (c) => {
    const session = c.get('user');
    await deleteLabel({ label_id: c.req.param('id'), session });
    return c.body(null, 204);
  });

  app.get('/api/planner/v1/plans/:id/categories', async (c) => {
    const session = c.get('user');
    const planId = c.req.param('id');
    const [plan, allLabels, task_counts] = await Promise.all([
      getPlan({ plan_id: planId, session }),
      listLabels({ plan_id: planId, session }),
      countTasksByCategorySlot({ plan_id: planId, session }),
    ]);
    const descriptions = plan.category_descriptions ?? {};
    // Editor's right column only shows labels bound to a category slot.
    const labels = allLabels.filter((l) => l.category_slot !== null);
    const categoriesCount = Object.values(descriptions).filter(
      (v) => typeof v === 'string' && v.length > 0,
    ).length;
    return c.json({
      descriptions,
      labels,
      task_counts,
      counts: { categories: categoriesCount },
    });
  });

  app.put('/api/planner/v1/plans/:id/categories', async (c) => {
    const session = c.get('user');
    const parsed = setCategoriesSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    const slots: Record<number, { name?: string | null; label_id?: string | null }> = {};
    for (const [k, v] of Object.entries(parsed.data.slots)) {
      slots[Number(k)] = v;
    }
    return c.json(
      await setCategoryDescriptions({
        plan_id: c.req.param('id'),
        slots,
        session,
      }),
    );
  });
}
