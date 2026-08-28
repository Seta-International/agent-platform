import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerHiringAdminRoutes } from './admin.ts';
import { registerHiringCandidateRoutes } from './candidates.ts';
import { registerHiringCvRoutes } from './cv.ts';
import { registerHiringInterviewRoutes } from './interviews.ts';
import { registerHiringOpeningRoutes } from './openings.ts';
import { registerHiringRequisitionRoutes } from './requisitions.ts';

export function buildHiringRoutes(deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerHiringRequisitionRoutes(app);
  registerHiringOpeningRoutes(app);
  registerHiringCandidateRoutes(app);
  registerHiringInterviewRoutes(app);
  registerHiringCvRoutes(app, { resolveModel: deps.resolveModel });
  registerHiringAdminRoutes(app);
  return app;
}
