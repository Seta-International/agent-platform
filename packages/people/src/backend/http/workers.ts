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
  listDirectory,
  listWorkers,
  provisionAccount,
  reinstateWorker,
  removePersonSkill,
  setPersonSkillLevel,
  terminateWorker,
} from '../../index.ts';

const editBody = z.object({
  expected_version: z.number().int().positive().optional(),
  patch: editWorkerPatch,
});

const addSkillBody = z.object({
  skill_id: z.string().uuid(),
  level: z.number().int().min(1).max(5).optional(),
});

const skillLevelBody = z.object({
  level: z.number().int().min(1).max(5).nullable(),
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
      excludeStatus: list('exclude_status'),
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
  app.patch('/api/people/v1/workers/:id/skills/:skillId', async (c) => {
    const parsed = skillLevelBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await setPersonSkillLevel({
      person_id: c.req.param('id'),
      skill_id: c.req.param('skillId'),
      level: parsed.data.level,
      session: c.get('user'),
    });
    return c.body(null, 204);
  });
  app.delete('/api/people/v1/workers/:id/skills/:skillId', async (c) => {
    await removePersonSkill({
      person_id: c.req.param('id'),
      skill_id: c.req.param('skillId'),
      session: c.get('user'),
    });
    return c.body(null, 204);
  });
  app.post('/api/people/v1/workers/:id/terminate', async (c) =>
    c.json(await terminateWorker({ worker_id: c.req.param('id'), session: c.get('user') })),
  );
  app.post('/api/people/v1/workers/:id/reinstate', async (c) =>
    c.json(await reinstateWorker({ worker_id: c.req.param('id'), session: c.get('user') })),
  );
  app.post('/api/people/v1/directory/:personId/provision', async (c) =>
    c.json(await provisionAccount(c.get('user'), { person_id: c.req.param('personId') })),
  );
  app.get('/api/people/v1/directory', async (c) => {
    const session = c.get('user');
    const page = Number(c.req.query('page') ?? '0');
    const pageSizeRaw = c.req.query('pageSize');
    const pageSize = pageSizeRaw ? Number(pageSizeRaw) : undefined;
    const status = c.req.query('status') as 'none' | 'active' | 'suspended' | undefined;
    const employment = c.req.query('employment') as 'active' | 'terminated' | undefined;
    const group_id = c.req.query('group_id') || undefined;
    return c.json(
      await listDirectory(session, {
        search: c.req.query('search'),
        status,
        employment,
        group_id,
        page,
        pageSize,
      }),
    );
  });
}
