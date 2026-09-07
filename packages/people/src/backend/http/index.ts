import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerPeopleAllocationRoutes } from './allocations.ts';
import { registerPeopleCvRoutes } from './cv.ts';
import { registerPeopleMeRoutes } from './me.ts';
import { registerPeopleMoraleRoutes } from './morale.ts';
import { registerPeopleOrgRoutes } from './org.ts';
import { registerPeoplePerformanceRoutes } from './performance.ts';
import { registerPeoplePhotoRoutes } from './photo.ts';
import { registerPeoplePickersRoutes } from './pickers.ts';
import { registerPeopleWorkersRoutes } from './workers.ts';

export { registerPeopleAllocationRoutes } from './allocations.ts';
export { registerPeopleCvRoutes } from './cv.ts';
export { registerPeopleMeRoutes } from './me.ts';
export { registerPeopleMoraleRoutes } from './morale.ts';
export { registerPeopleOrgRoutes } from './org.ts';
export { registerPeoplePerformanceRoutes } from './performance.ts';
export { registerPeoplePhotoRoutes } from './photo.ts';
export { registerPeoplePickersRoutes } from './pickers.ts';
export { registerPeopleWorkersRoutes } from './workers.ts';

export function buildPeopleRoutes(deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerPeopleWorkersRoutes(app);
  registerPeopleCvRoutes(app, { resolveModel: deps.resolveModel });
  registerPeoplePhotoRoutes(app);
  registerPeopleMeRoutes(app);
  registerPeoplePickersRoutes(app);
  registerPeopleOrgRoutes(app);
  registerPeopleAllocationRoutes(app);
  registerPeoplePerformanceRoutes(app);
  registerPeopleMoraleRoutes(app);
  return app;
}
