import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { addOpeningInput, closeOpeningInput } from '../../contracts.ts';
import { addOpening, closeOpening } from '../../index.ts';

const closeBody = z
  .object({ expected_version: z.number().int().positive().optional() })
  .and(closeOpeningInput);

export function registerHiringOpeningRoutes(app: Hono<SessionEnv>): void {
  app.post('/api/hiring/v1/requisitions/:id/openings', async (c) => {
    const parsed = addOpeningInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await addOpening({
        requisition_id: c.req.param('id'),
        input: parsed.data,
        session: c.get('user'),
      }),
      201,
    );
  });
  app.post('/api/hiring/v1/openings/:openingId/close', async (c) => {
    const parsed = closeBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    const { expected_version, ...input } = parsed.data;
    return c.json(
      await closeOpening({
        opening_id: c.req.param('openingId'),
        expected_version,
        input,
        session: c.get('user'),
      }),
    );
  });
}
