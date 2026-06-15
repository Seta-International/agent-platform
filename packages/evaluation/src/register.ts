import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as schema from './backend/db/schema.ts';
import { buildEvaluationRoutes } from './backend/http/index.ts';
import { evaluationJobs } from './backend/jobs/index.ts';
import { EvaluationError } from './backend/rbac.ts';
import { EVALUATION_EVENTS } from './events.ts';
import { evaluationRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const evaluationErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof EvaluationError)) return null;
  const status: ContentfulStatusCode =
    err.code === 'FORBIDDEN'
      ? 403
      : err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'CROSS_TENANT'
          ? 403
          : err.code === 'CONFLICT'
            ? 409
            : 400;
  return { status, body: { error: err.code, message: err.message, details: err.details } };
};

export function registerEvaluationContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'evaluation',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: EVALUATION_EVENTS,
    rbac: evaluationRbac,
    routes: { mountAt: '/', build: buildEvaluationRoutes },
    jobs: evaluationJobs,
    errorMapper: evaluationErrorMapper,
  });
}
