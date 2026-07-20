import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { getKpiNorm } from '../../index.ts';

export function registerPmKpiNormRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/pm/v1/kpi-norm', async (c) => c.json(await getKpiNorm(c.get('user'))));
}
