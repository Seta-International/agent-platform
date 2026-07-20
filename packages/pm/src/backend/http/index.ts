import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerPmAccountsRoutes } from './accounts.ts';
import { registerPmAllocationsRoutes } from './allocations.ts';
import { registerPmChartersRoutes } from './charters.ts';
import { registerPmKpiAppliedMetricsRoutes } from './kpi-applied-metrics.ts';
import { registerPmKpiNormRoutes } from './kpi-norm.ts';
import { registerPmKpiRecordsRoutes } from './kpi-records.ts';
import { registerPmProjectsRoutes } from './projects.ts';
import { registerPmWeeklyReportsRoutes } from './weekly-reports.ts';

export { registerPmAccountsRoutes } from './accounts.ts';
export { registerPmAllocationsRoutes } from './allocations.ts';
export { registerPmChartersRoutes } from './charters.ts';
export { registerPmKpiAppliedMetricsRoutes } from './kpi-applied-metrics.ts';
export { registerPmKpiNormRoutes } from './kpi-norm.ts';
export { registerPmKpiRecordsRoutes } from './kpi-records.ts';
export { registerPmProjectsRoutes } from './projects.ts';
export { registerPmWeeklyReportsRoutes } from './weekly-reports.ts';

export function buildPmRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerPmAccountsRoutes(app);
  registerPmAllocationsRoutes(app);
  registerPmChartersRoutes(app);
  registerPmKpiNormRoutes(app);
  registerPmKpiAppliedMetricsRoutes(app);
  registerPmKpiRecordsRoutes(app);
  registerPmProjectsRoutes(app);
  registerPmWeeklyReportsRoutes(app);
  return app;
}
