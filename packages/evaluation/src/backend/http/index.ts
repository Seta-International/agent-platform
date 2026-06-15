import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerEvaluationDatasetRoutes } from './datasets.ts';
import { registerEvaluationRunRoutes } from './runs.ts';

export function buildEvaluationRoutes(deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerEvaluationDatasetRoutes(app);
  registerEvaluationRunRoutes(app, { workers: deps.workers });
  return app;
}
