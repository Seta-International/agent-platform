import { type RouteBuildDeps, requireFeature, type SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerPmAccountsRoutes } from './accounts.ts';
import { registerPmAllocationsRoutes } from './allocations.ts';
import { registerPmChartersRoutes } from './charters.ts';
import { registerPmProjectsRoutes } from './projects.ts';

export { registerPmAccountsRoutes } from './accounts.ts';
export { registerPmAllocationsRoutes } from './allocations.ts';
export { registerPmChartersRoutes } from './charters.ts';
export { registerPmProjectsRoutes } from './projects.ts';

export function buildPmRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', requireFeature('pm'));
  registerPmAccountsRoutes(app);
  registerPmAllocationsRoutes(app);
  registerPmChartersRoutes(app);
  registerPmProjectsRoutes(app);
  return app;
}
