import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerHiringAdminRoutes } from './admin.ts';
import { registerHiringCandidateRoutes } from './candidates.ts';
import { registerHiringOpeningRoutes } from './openings.ts';
import { registerHiringRequisitionRoutes } from './requisitions.ts';

export function buildHiringRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerHiringRequisitionRoutes(app);
  registerHiringOpeningRoutes(app);
  registerHiringCandidateRoutes(app);
  registerHiringAdminRoutes(app);
  return app;
}
