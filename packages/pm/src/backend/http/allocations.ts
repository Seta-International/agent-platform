import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { createAllocationInput, updateAllocationInput } from '../../contracts.ts';
import {
  createAllocation,
  listAllocations,
  listProjectAllocations,
  removeAllocation,
  updateAllocation,
} from '../../index.ts';

export function registerPmAllocationsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/pm/v1/allocations', async (c) =>
    c.json({
      allocations: await listAllocations({
        account_id: c.req.query('account_id'),
        project_id: c.req.query('project_id'),
        active_from: c.req.query('active_from'),
        active_to: c.req.query('active_to'),
        session: c.get('user'),
      }),
    }),
  );
  app.post('/api/pm/v1/allocations', async (c) => {
    const parsed = createAllocationInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await createAllocation({ ...parsed.data, session: c.get('user') }), 201);
  });
  app.get('/api/pm/v1/projects/:id/allocations', async (c) =>
    c.json({
      allocations: await listProjectAllocations({
        project_id: c.req.param('id'),
        session: c.get('user'),
      }),
    }),
  );
  app.patch('/api/pm/v1/allocations/:id', async (c) => {
    const parsed = updateAllocationInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await updateAllocation({
        allocation_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.delete('/api/pm/v1/allocations/:id', async (c) => {
    await removeAllocation({ allocation_id: c.req.param('id'), session: c.get('user') });
    return c.body(null, 204);
  });
}
