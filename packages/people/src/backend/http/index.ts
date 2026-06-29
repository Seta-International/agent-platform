import { type RouteBuildDeps, requireFeature, type SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerPeopleAllocationRoutes } from './allocations.ts';
import { registerPeopleOrgRoutes } from './org.ts';
import { registerPeoplePickersRoutes } from './pickers.ts';
import { registerPeopleWorkersRoutes } from './workers.ts';

export { registerPeopleAllocationRoutes } from './allocations.ts';
export { registerPeopleOrgRoutes } from './org.ts';
export { registerPeoplePickersRoutes } from './pickers.ts';
export { registerPeopleWorkersRoutes } from './workers.ts';

export function buildPeopleRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', requireFeature('people'));
  registerPeopleWorkersRoutes(app);
  registerPeoplePickersRoutes(app);
  registerPeopleOrgRoutes(app);
  registerPeopleAllocationRoutes(app);
  return app;
}
