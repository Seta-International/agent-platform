import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerPeoplePickersRoutes } from './pickers.ts';
import { registerPeopleWorkersRoutes } from './workers.ts';

export { registerPeoplePickersRoutes } from './pickers.ts';
export { registerPeopleWorkersRoutes } from './workers.ts';

export function buildPeopleRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerPeopleWorkersRoutes(app);
  registerPeoplePickersRoutes(app);
  return app;
}
