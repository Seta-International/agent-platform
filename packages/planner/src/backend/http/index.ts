import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import type { BoardStreamHub } from '../stream/hub.ts';
import { registerPlannerBoardStreamRoutes } from '../stream/route.ts';
import { registerPlannerBucketsRoutes } from './buckets.ts';
import { registerPlannerGroupsRoutes } from './groups.ts';
import { registerPlannerPlansRoutes } from './plans.ts';
import { registerPlannerTasksRoutes } from './tasks.ts';

export { registerPlannerBoardStreamRoutes } from '../stream/route.ts';
export { registerPlannerBucketsRoutes } from './buckets.ts';
export { registerPlannerGroupsRoutes } from './groups.ts';
export { registerPlannerPlansRoutes } from './plans.ts';
export { registerPlannerTasksRoutes } from './tasks.ts';

export function buildPlannerRoutes(deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerPlannerGroupsRoutes(app, { workers: deps.workers, log: deps.log });
  registerPlannerPlansRoutes(app, { workers: deps.workers });
  registerPlannerBucketsRoutes(app);
  registerPlannerTasksRoutes(app);
  const boardStream = deps.streams.get('planner') as { hub: BoardStreamHub } | undefined;
  if (boardStream) registerPlannerBoardStreamRoutes(app, boardStream.hub);
  return app;
}
