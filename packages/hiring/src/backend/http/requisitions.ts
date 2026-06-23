import { isFeatureEnabled, type SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import {
  closeRequisitionInput,
  editRequisitionPatch,
  jdSectionInput,
  openRequisitionInput,
  skillInput,
} from '../../contracts.ts';
import {
  closeRequisition,
  editRequisition,
  getRequisition,
  holdRequisition,
  listRequisitions,
  openRequisition,
  resumeRequisition,
  setRequisitionJd,
  setRequisitionSkills,
} from '../../index.ts';

const editBody = z.object({
  expected_version: z.number().int().positive().optional(),
  patch: editRequisitionPatch,
});
const jdBody = z.object({
  expected_version: z.number().int().positive().optional(),
  sections: z.array(jdSectionInput),
});
const skillsBody = z.object({
  expected_version: z.number().int().positive().optional(),
  skills: z.array(skillInput),
});
const versionBody = z.object({ expected_version: z.number().int().positive().optional() });

export function registerHiringRequisitionRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/hiring/v1/requisitions', async (c) => {
    if (!isFeatureEnabled(c.get('user'), 'hiring')) return c.json({ error: 'not_found' }, 404);
    return c.json({ requisitions: await listRequisitions(c.get('user')) });
  });
  app.get('/api/hiring/v1/requisitions/:id', async (c) =>
    c.json(await getRequisition({ requisition_id: c.req.param('id'), session: c.get('user') })),
  );
  app.post('/api/hiring/v1/requisitions', async (c) => {
    const parsed = openRequisitionInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await openRequisition({ ...parsed.data, session: c.get('user') }), 201);
  });
  app.patch('/api/hiring/v1/requisitions/:id', async (c) => {
    const parsed = editBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await editRequisition({
        requisition_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.put('/api/hiring/v1/requisitions/:id/jd', async (c) => {
    const parsed = jdBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await setRequisitionJd({
        requisition_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.put('/api/hiring/v1/requisitions/:id/skills', async (c) => {
    const parsed = skillsBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await setRequisitionSkills({
        requisition_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/requisitions/:id/hold', async (c) => {
    const parsed = versionBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await holdRequisition({
        requisition_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/requisitions/:id/resume', async (c) => {
    const parsed = versionBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await resumeRequisition({
        requisition_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/requisitions/:id/close', async (c) => {
    const body = z
      .object({ expected_version: z.number().int().positive().optional() })
      .and(closeRequisitionInput)
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: 'VALIDATION', details: body.error.flatten() }, 400);
    return c.json(
      await closeRequisition({
        requisition_id: c.req.param('id'),
        ...body.data,
        session: c.get('user'),
      }),
    );
  });
}
