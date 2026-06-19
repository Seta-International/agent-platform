import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { createWorkerInput, editWorkerPatch } from '../../contracts.ts';
import { createWorker, editWorker, getWorker, getWorkerHistory, listWorkers } from '../../index.ts';

const editBody = z.object({
  expected_version: z.number().int().positive().optional(),
  patch: editWorkerPatch,
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
}
