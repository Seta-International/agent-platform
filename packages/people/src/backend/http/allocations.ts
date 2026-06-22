import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { getAllocationGrid, getUtilizationByPerson } from '../../index.ts';

export function registerPeopleAllocationRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/people/v1/allocation/grid', async (c) => {
    const yearRaw = c.req.query('year');
    const year = yearRaw ? Number(yearRaw) : undefined;
    const search = c.req.query('search') || undefined;
    return c.json(
      await getAllocationGrid(c.get('user'), {
        ...(Number.isFinite(year) ? { year } : {}),
        ...(search ? { search } : {}),
      }),
    );
  });
  app.get('/api/people/v1/allocation/utilization', async (c) => {
    const asOf = c.req.query('asOf');
    return c.json(await getUtilizationByPerson(c.get('user'), asOf ? { asOf } : {}));
  });
}
