import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import {
  checkAllocationEffortQuery,
  createAllocationInput,
  reassignAllocationInput,
  reassignWorkerAllocationsInput,
  splitAllocationInput,
  updateAllocationInput,
} from '../../contracts.ts';
import {
  checkAllocationEffort,
  createAllocation,
  listAllocations,
  listProjectAllocations,
  previewReassignAllocation,
  previewReassignWorkerAllocations,
  reassignAllocation,
  reassignWorkerAllocations,
  removeAllocation,
  splitAllocation,
  updateAllocation,
} from '../../index.ts';

export function registerPmAllocationsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/pm/v1/allocations', async (c) =>
    c.json({
      allocations: await listAllocations({
        account_id: c.req.query('account_id'),
        project_id: c.req.query('project_id'),
        worker_id: c.req.query('worker_id'),
        active_from: c.req.query('active_from'),
        active_to: c.req.query('active_to'),
        q: c.req.query('q'),
        session: c.get('user'),
      }),
    }),
  );
  app.get('/api/pm/v1/allocations/effort-check', async (c) => {
    const parsed = checkAllocationEffortQuery.safeParse({
      worker_id: c.req.query('worker_id'),
      date_from: c.req.query('date_from'),
      date_to: c.req.query('date_to'),
      planned_pct: c.req.query('planned_pct'),
      exclude_allocation_id: c.req.query('exclude_allocation_id'),
    });
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await checkAllocationEffort({ ...parsed.data, session: c.get('user') }));
  });
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
  app.post('/api/pm/v1/allocations/:id/split', async (c) => {
    const parsed = splitAllocationInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await splitAllocation({
        allocation_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/pm/v1/allocations/:id/reassign', async (c) => {
    const parsed = reassignAllocationInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await reassignAllocation({
        allocation_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/pm/v1/allocations/:id/reassign/preview', async (c) => {
    const parsed = reassignAllocationInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await previewReassignAllocation({
        allocation_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/pm/v1/allocations/reassign-group', async (c) => {
    const parsed = reassignWorkerAllocationsInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await reassignWorkerAllocations({ ...parsed.data, session: c.get('user') }));
  });
  app.post('/api/pm/v1/allocations/reassign-group/preview', async (c) => {
    const parsed = reassignWorkerAllocationsInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await previewReassignWorkerAllocations({ ...parsed.data, session: c.get('user') }),
    );
  });
}
