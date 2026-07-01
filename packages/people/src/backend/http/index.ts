import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerPeopleAllocationRoutes } from './allocations.ts';
import { registerPeopleMeRoutes } from './me.ts';
import { registerPeopleOrgRoutes } from './org.ts';
import { registerPeoplePickersRoutes } from './pickers.ts';
import { registerPeopleWorkersRoutes } from './workers.ts';

export { registerPeopleAllocationRoutes } from './allocations.ts';
export { registerPeopleMeRoutes } from './me.ts';
export { registerPeopleOrgRoutes } from './org.ts';
export { registerPeoplePickersRoutes } from './pickers.ts';
export { registerPeopleWorkersRoutes } from './workers.ts';

export function buildPeopleRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerPeopleWorkersRoutes(app);
  registerPeopleMeRoutes(app);
  registerPeoplePickersRoutes(app);
  registerPeopleOrgRoutes(app);
  registerPeopleAllocationRoutes(app);
  return app;
}
