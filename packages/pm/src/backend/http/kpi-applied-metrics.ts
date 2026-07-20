import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { kpiAppliedMetricsQuery, setAppliedMetricInput } from '../../contracts.ts';
import { listAppliedMetrics, setAppliedMetric } from '../../index.ts';

export function registerPmKpiAppliedMetricsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/pm/v1/kpi-applied-metrics', async (c) => {
    const parsed = kpiAppliedMetricsQuery.safeParse(c.req.query());
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json({
      coverage: await listAppliedMetrics(c.get('user'), parsed.data.project_ids ?? []),
    });
  });
  app.put('/api/pm/v1/kpi-applied-metrics/:metricId', async (c) => {
    const parsed = setAppliedMetricInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await setAppliedMetric({
        metric_id: c.req.param('metricId'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
}
