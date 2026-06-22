import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { getAllocationGrid } from '../../index.ts';

export function registerPeopleAllocationRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/people/v1/allocation/grid', async (c) => {
    const yearRaw = c.req.query('year');
    const year = yearRaw ? Number(yearRaw) : undefined;
    return c.json(await getAllocationGrid(c.get('user'), Number.isFinite(year) ? { year } : {}));
  });
}
