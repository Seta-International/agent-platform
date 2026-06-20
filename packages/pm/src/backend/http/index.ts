import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerPmAccountsRoutes } from './accounts.ts';
import { registerPmChartersRoutes } from './charters.ts';
import { registerPmProjectsRoutes } from './projects.ts';

export { registerPmAccountsRoutes } from './accounts.ts';
export { registerPmChartersRoutes } from './charters.ts';
export { registerPmProjectsRoutes } from './projects.ts';

export function buildPmRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerPmAccountsRoutes(app);
  registerPmChartersRoutes(app);
  registerPmProjectsRoutes(app);
  return app;
}
