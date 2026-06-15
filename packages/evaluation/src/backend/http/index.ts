import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerEvaluationDatasetRoutes } from './datasets.ts';

export function buildEvaluationRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerEvaluationDatasetRoutes(app);
  return app;
}
