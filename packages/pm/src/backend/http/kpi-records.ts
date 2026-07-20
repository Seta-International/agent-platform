import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { kpiExplorerQuery, kpiRecordQuery, upsertKpiRecordInput } from '../../contracts.ts';
import { getKpiRecord, listKpiExplorer, upsertKpiRecord } from '../../index.ts';

export function registerPmKpiRecordsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/pm/v1/kpi-explorer', async (c) => {
    const parsed = kpiExplorerQuery.safeParse(c.req.query());
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await listKpiExplorer({ ...parsed.data, session: c.get('user') }));
  });

  app.get('/api/pm/v1/kpi-records', async (c) => {
    const parsed = kpiRecordQuery.safeParse(c.req.query());
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await getKpiRecord({ ...parsed.data, session: c.get('user') }));
  });

  app.put('/api/pm/v1/kpi-records', async (c) => {
    const parsed = upsertKpiRecordInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await upsertKpiRecord({ ...parsed.data, session: c.get('user') }));
  });
}
