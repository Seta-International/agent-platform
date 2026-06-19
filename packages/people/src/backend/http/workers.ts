import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { createWorkerInput, editWorkerPatch } from '../../contracts.ts';
import {
  createWorker,
  editWorker,
  getWorker,
  getWorkerHistory,
  listWorkers,
  setPortalAccess,
  setPortalAccessBulk,
} from '../../index.ts';

const editBody = z.object({
  expected_version: z.number().int().positive().optional(),
  patch: editWorkerPatch,
});

const portalBody = z.object({ enabled: z.boolean() });
const portalBulkBody = z.object({
  worker_ids: z.array(z.string().uuid()).min(1).max(500),
  enabled: z.boolean(),
});

export function registerPeopleWorkersRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/people/v1/workers', async (c) =>
    c.json({ workers: await listWorkers(c.get('user')) }),
  );
  app.get('/api/people/v1/workers/:id', async (c) =>
    c.json(await getWorker({ worker_id: c.req.param('id'), session: c.get('user') })),
  );
  app.get('/api/people/v1/workers/:id/history', async (c) =>
    c.json({
      history: await getWorkerHistory({ worker_id: c.req.param('id'), session: c.get('user') }),
    }),
  );
  app.post('/api/people/v1/workers', async (c) => {
    const parsed = createWorkerInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await createWorker({ ...parsed.data, session: c.get('user') }), 201);
  });
  app.patch('/api/people/v1/workers/:id', async (c) => {
    const parsed = editBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await editWorker({ worker_id: c.req.param('id'), ...parsed.data, session: c.get('user') }),
    );
  });
  app.post('/api/people/v1/workers/portal-access/bulk', async (c) => {
    const parsed = portalBulkBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await setPortalAccessBulk({ ...parsed.data, session: c.get('user') }));
  });
  app.post('/api/people/v1/workers/:id/portal-access', async (c) => {
    const parsed = portalBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await setPortalAccess({
        worker_id: c.req.param('id'),
        enabled: parsed.data.enabled,
        session: c.get('user'),
      }),
    );
  });
}
