import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { closeReasonInput, jdTemplateInput, rejectionReasonInput } from '../../contracts.ts';
import {
  archiveCloseReason,
  archiveRejectionReason,
  createCloseReason,
  createJdTemplate,
  createRejectionReason,
  deleteJdTemplate,
  listCloseReasons,
  listJdTemplates,
  listRejectionReasons,
} from '../../index.ts';

const archiveBody = z.object({ expected_version: z.number().int().positive().optional() });

export function registerHiringAdminRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/hiring/v1/jd-templates', async (c) =>
    c.json({ templates: await listJdTemplates(c.get('user')) }),
  );
  app.post('/api/hiring/v1/jd-templates', async (c) => {
    const parsed = jdTemplateInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await createJdTemplate({ input: parsed.data, session: c.get('user') }), 201);
  });
  app.delete('/api/hiring/v1/jd-templates/:id', async (c) => {
    await deleteJdTemplate({ template_id: c.req.param('id'), session: c.get('user') });
    return c.body(null, 204);
  });
  app.get('/api/hiring/v1/close-reasons', async (c) =>
    c.json({ reasons: await listCloseReasons(c.get('user')) }),
  );
  app.post('/api/hiring/v1/close-reasons', async (c) => {
    const parsed = closeReasonInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await createCloseReason({ input: parsed.data, session: c.get('user') }), 201);
  });
  app.post('/api/hiring/v1/close-reasons/:id/archive', async (c) => {
    const parsed = archiveBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await archiveCloseReason({ id: c.req.param('id'), ...parsed.data, session: c.get('user') }),
    );
  });
  app.get('/api/hiring/v1/rejection-reasons', async (c) =>
    c.json({ reasons: await listRejectionReasons(c.get('user')) }),
  );
  app.post('/api/hiring/v1/rejection-reasons', async (c) => {
    const parsed = rejectionReasonInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await createRejectionReason({ input: parsed.data, session: c.get('user') }), 201);
  });
  app.post('/api/hiring/v1/rejection-reasons/:id/archive', async (c) => {
    const parsed = archiveBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await archiveRejectionReason({
        id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
}
