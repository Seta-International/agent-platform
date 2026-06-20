import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { editCharterPatch, submitCharterInput } from '../../contracts.ts';
import {
  approveCharter,
  editCharter,
  getCharter,
  listCharters,
  rejectCharter,
  submitCharter,
  withdrawCharter,
} from '../../index.ts';

const editBody = z.object({
  expected_version: z.number().int().positive().optional(),
  patch: editCharterPatch,
});
const decideBody = z.object({ expected_version: z.number().int().positive().optional() });
const rejectBody = z.object({
  expected_version: z.number().int().positive().optional(),
  reason: z.string().min(1),
});

export function registerPmChartersRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/pm/v1/charters', async (c) =>
    c.json({ charters: await listCharters(c.get('user')) }),
  );
  app.get('/api/pm/v1/charters/:id', async (c) =>
    c.json(await getCharter({ charter_id: c.req.param('id'), session: c.get('user') })),
  );
  app.post('/api/pm/v1/charters', async (c) => {
    const parsed = submitCharterInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await submitCharter({ ...parsed.data, session: c.get('user') }), 201);
  });
  app.patch('/api/pm/v1/charters/:id', async (c) => {
    const parsed = editBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await editCharter({ charter_id: c.req.param('id'), ...parsed.data, session: c.get('user') }),
    );
  });
  app.post('/api/pm/v1/charters/:id/approve', async (c) => {
    const parsed = decideBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await approveCharter({
        charter_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/pm/v1/charters/:id/reject', async (c) => {
    const parsed = rejectBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await rejectCharter({
        charter_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/pm/v1/charters/:id/withdraw', async (c) => {
    const parsed = decideBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await withdrawCharter({
        charter_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
}
