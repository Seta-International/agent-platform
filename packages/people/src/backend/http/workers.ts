import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { createWorkerInput, editWorkerPatch } from '../../contracts.ts';
import {
  addPersonSkill,
  createWorker,
  editWorker,
  getWorker,
  getWorkerHistory,
  listWorkers,
  removePersonSkill,
  setPortalAccess,
  setPortalAccessBulk,
} from '../../index.ts';

const editBody = z.object({
  expected_version: z.number().int().positive().optional(),
  patch: editWorkerPatch,
});

const addSkillBody = z.object({
  skill_id: z.string().uuid(),
  level: z.number().int().min(1).max(5).optional(),
});

const portalBody = z.object({ enabled: z.boolean() });
const portalBulkBody = z.object({
  worker_ids: z.array(z.string().uuid()).min(1).max(500),
  enabled: z.boolean(),
});

export function registerPeopleWorkersRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/people/v1/workers', async (c) => {
    const list = (name: string): string[] | undefined => {
      const raw = c.req.query(name);
      if (!raw) return undefined;
      const vals = raw.split(',').filter(Boolean);
      return vals.length > 0 ? vals : undefined;
    };

    const num = (raw: string | undefined): number | undefined => {
      if (!raw) return undefined;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : undefined;
    };

    const pageSize = num(c.req.query('pageSize'));
    const page = num(c.req.query('page'));

    let sort: { field: string; dir: 'asc' | 'desc' } | undefined;
    const sortRaw = c.req.query('sort');
    if (sortRaw) {
      const [field, dir] = sortRaw.split(':');
      if (field) sort = { field, dir: dir === 'desc' ? 'desc' : 'asc' };
    }

    const { rows, total } = await listWorkers(c.get('user'), {
      search: c.req.query('search') || undefined,
      ids: list('ids'),
      status: list('status'),
      account_id: list('account_id'),
      project_id: list('project_id'),
      skill_id: list('skill_id'),
      sort,
      page,
      pageSize,
    });
    return c.json({ rows, total });
  });
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
  app.post('/api/people/v1/workers/:id/skills', async (c) => {
    const parsed = addSkillBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await addPersonSkill({
      person_id: c.req.param('id'),
      skill_id: parsed.data.skill_id,
      level: parsed.data.level,
      session: c.get('user'),
    });
    return c.body(null, 201);
  });
  app.delete('/api/people/v1/workers/:id/skills/:skillId', async (c) => {
    await removePersonSkill({
      person_id: c.req.param('id'),
      skill_id: c.req.param('skillId'),
      session: c.get('user'),
    });
    return c.body(null, 204);
  });
}
