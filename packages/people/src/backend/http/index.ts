import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerPeopleWorkersRoutes } from './workers.ts';

export { registerPeopleWorkersRoutes } from './workers.ts';

export function buildPeopleRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerPeopleWorkersRoutes(app);
  return app;
}
