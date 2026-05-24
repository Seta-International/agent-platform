import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { plannerAgentTools } from './agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import { buildPlannerRoutes } from './backend/http/index.ts';
import { PlannerError } from './backend/rbac.ts';
import { buildPlannerBoardStreamHub } from './backend/stream/index.ts';
import { plannerSubscribers } from './backend/subscribers/index.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const plannerErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof PlannerError)) return null;
  const status: ContentfulStatusCode =
    err.code === 'FORBIDDEN'
      ? 403
      : err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'CONFLICT'
          ? 409
          : err.code === 'CROSS_TENANT'
            ? 403
            : err.code === 'VALIDATION'
              ? 400
              : err.code === 'LINKED_GROUP_IMMUTABLE_MEMBERS'
                ? 409
                : err.code === 'LINKED_DUPLICATE'
                  ? 409
                  : err.code === 'DUPLICATE_REFERENCE'
                    ? 409
                    : err.code === 'RESERVED_FOR_SYSTEM_ACTOR'
                      ? 403
                      : err.code === 'PLAN_NOT_LINKED'
                        ? 409
                        : 400;
  return { status, body: { error: err.code, message: err.message, details: err.details } };
};

export function registerPlannerContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'planner',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
    agentTools: plannerAgentTools,
    subscribers: plannerSubscribers(),
    routes: { mountAt: '/', build: buildPlannerRoutes },
    stream: buildPlannerBoardStreamHub,
    errorMapper: plannerErrorMapper,
  });
}
