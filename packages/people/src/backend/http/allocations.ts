import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { getAllocationGrid, getUtilizationByPerson } from '../../index.ts';

export function registerPeopleAllocationRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/people/v1/allocation/grid', async (c) => {
    const yearRaw = c.req.query('year');
    const year = yearRaw ? Number(yearRaw) : undefined;
    const search = c.req.query('search') || undefined;
    const statusRaw = c.req.query('status');
    const status = statusRaw === 'over' || statusRaw === 'under' ? statusRaw : undefined;
    const accountId = c.req.query('accountId') || undefined;
    const projectId = c.req.query('projectId') || undefined;
    const bucketRaw = c.req.query('bucket');
    const bucket =
      bucketRaw === 'billable' || bucketRaw === 'internal' || bucketRaw === 'bench'
        ? bucketRaw
        : undefined;
    const crossProject =
      c.req.query('crossProject') === '1' || c.req.query('crossProject') === 'true';
    return c.json(
      await getAllocationGrid(c.get('user'), {
        ...(Number.isFinite(year) ? { year } : {}),
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(accountId ? { accountId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(bucket ? { bucket } : {}),
        ...(crossProject ? { crossProject: true } : {}),
      }),
    );
  });
  app.get('/api/people/v1/allocation/utilization', async (c) => {
    const asOf = c.req.query('asOf') || undefined;
    const search = c.req.query('search') || undefined;
    const statusRaw = c.req.query('status');
    const status = statusRaw === 'over' || statusRaw === 'under' ? statusRaw : undefined;
    const accountId = c.req.query('accountId') || undefined;
    const projectId = c.req.query('projectId') || undefined;
    const bucketRaw = c.req.query('bucket');
    const bucket =
      bucketRaw === 'billable' || bucketRaw === 'internal' || bucketRaw === 'bench'
        ? bucketRaw
        : undefined;
    const crossProject =
      c.req.query('crossProject') === '1' || c.req.query('crossProject') === 'true';
    return c.json(
      await getUtilizationByPerson(c.get('user'), {
        ...(asOf ? { asOf } : {}),
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(accountId ? { accountId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(bucket ? { bucket } : {}),
        ...(crossProject ? { crossProject: true } : {}),
      }),
    );
  });
}
