import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { removeAllocation } from '../../index.ts';

export function registerPmAllocationsRoutes(app: Hono<SessionEnv>): void {
  app.delete('/api/pm/v1/allocations/:id', async (c) => {
    await removeAllocation({ allocation_id: c.req.param('id'), session: c.get('user') });
    return c.body(null, 204);
  });
}
