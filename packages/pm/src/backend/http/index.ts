import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerPmAccountsRoutes } from './accounts.ts';

export { registerPmAccountsRoutes } from './accounts.ts';

export function buildPmRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerPmAccountsRoutes(app);
  return app;
}
