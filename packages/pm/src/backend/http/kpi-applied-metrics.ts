import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { kpiAppliedMetricsQuery, setAppliedMetricsInput } from '../../contracts.ts';
import { listAppliedMetrics, setAppliedMetrics } from '../../index.ts';

export function registerPmKpiAppliedMetricsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/pm/v1/kpi-applied-metrics', async (c) => {
    const parsed = kpiAppliedMetricsQuery.safeParse(c.req.query());
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    const { project_ids, iso_year, iso_week } = parsed.data;
    const week =
      iso_year !== undefined && iso_week !== undefined ? { iso_year, iso_week } : undefined;
    return c.json({
      coverage: await listAppliedMetrics(c.get('user'), project_ids ?? [], week),
    });
  });
  app.put('/api/pm/v1/kpi-applied-metrics', async (c) => {
    const parsed = setAppliedMetricsInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await setAppliedMetrics({ ...parsed.data, session: c.get('user') }));
  });
}
