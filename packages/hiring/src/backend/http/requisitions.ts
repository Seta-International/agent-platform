import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import {
  applyInternalInput,
  closeRequisitionInput,
  editRequisitionPatch,
  jdSectionInput,
  openRequisitionInput,
  skillInput,
} from '../../contracts.ts';
import {
  applyInternalRequisition,
  closeRequisition,
  editRequisition,
  getRequisition,
  holdRequisition,
  listAccounts,
  listOpenRequisitions,
  listProjects,
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
  // Backing data for the New Requisition account/project pickers — top-level resources, not
  // nested under /requisitions, so they don't need to dodge the `:id` route below.
  app.get('/api/hiring/v1/accounts', async (c) => {
    return c.json({ accounts: await listAccounts(c.get('user')) });
  });
  app.get('/api/hiring/v1/projects', async (c) => {
    const accountId = c.req.query('account_id');
    return c.json({ projects: await listProjects(c.get('user'), accountId) });
  });
  app.get('/api/hiring/v1/requisitions', async (c) => {
    return c.json({ requisitions: await listRequisitions(c.get('user')) });
  });
  // FUT-326/327 — open-positions board (every non-filled requisition, oversight- or
  // account-scoped). Registered before `:id` so the literal "board" segment is not parsed as a
  // requisition id.
  app.get('/api/hiring/v1/requisitions/board', async (c) => {
    // FUT-878: the board carries every status (incl. cancelled) so Board and List agree.
    return c.json(await listOpenRequisitions(c.get('user')));
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
  app.post('/api/hiring/v1/requisitions/:id/apply', async (c) => {
    const parsed = applyInternalInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await applyInternalRequisition({
        requisition_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
      201,
    );
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
