import type { SessionEnv } from '@seta/core';
import {
  createBucket,
  deleteBucket,
  listBuckets,
  reorderBucket,
  updateBucket,
} from '@seta/planner';
import type { Hono } from 'hono';
import { z } from 'zod';

const createSchema = z.object({
  plan_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  after_bucket_id: z.string().uuid().optional(),
});
const updateSchema = z.object({
  expected_version: z.number().int().positive(),
  patch: z.object({ name: z.string().min(1).max(120).optional() }),
});
const reorderSchema = z.object({
  expected_version: z.number().int().positive(),
  after_bucket_id: z.string().uuid().optional(),
});
const versionSchema = z.object({ expected_version: z.number().int().positive() });

export function registerPlannerBucketsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/planner/v1/plans/:planId/buckets', async (c) => {
    const session = c.get('user');
    const include_deleted = c.req.query('include_deleted') === 'true';
    return c.json({
      buckets: await listBuckets({
        plan_id: c.req.param('planId'),
        include_deleted,
        session,
      }),
    });
  });

  app.post('/api/planner/v1/buckets', async (c) => {
    const session = c.get('user');
    const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await createBucket({
        plan_id: parsed.data.plan_id,
        name: parsed.data.name,
        after_bucket_id: parsed.data.after_bucket_id,
        session,
      }),
      201,
    );
  });

  app.patch('/api/planner/v1/buckets/:id', async (c) => {
    const session = c.get('user');
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await updateBucket({
        bucket_id: c.req.param('id'),
        expected_version: parsed.data.expected_version,
        patch: parsed.data.patch,
        session,
      }),
    );
  });

  app.post('/api/planner/v1/buckets/:id/reorder', async (c) => {
    const session = c.get('user');
    const parsed = reorderSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await reorderBucket({
        bucket_id: c.req.param('id'),
        expected_version: parsed.data.expected_version,
        after_bucket_id: parsed.data.after_bucket_id,
        session,
      }),
    );
  });

  app.delete('/api/planner/v1/buckets/:id', async (c) => {
    const session = c.get('user');
    const parsed = versionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await deleteBucket({
      bucket_id: c.req.param('id'),
      expected_version: parsed.data.expected_version,
      session,
    });
    return c.body(null, 204);
  });
}
