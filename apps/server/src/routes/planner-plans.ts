import type { SessionEnv } from '@seta/core';
import { createPlan, deletePlan, getPlan, listPlans, restorePlan, updatePlan } from '@seta/planner';
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
}
