import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as schema from './backend/db/schema.ts';
import { buildHiringRoutes } from './backend/http/index.ts';
import { HiringError } from './backend/rbac.ts';
import { hiringSubscribers } from './backend/subscribers/index.ts';
import { HIRING_EVENTS } from './events.ts';
import { hiringFlags } from './flags.ts';
import { hiringRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const hiringErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof HiringError)) return null;
  const status: ContentfulStatusCode =
    err.code === 'FORBIDDEN'
      ? 403
      : err.code === 'CROSS_TENANT'
        ? 403
        : err.code === 'NOT_FOUND'
          ? 404
          : err.code === 'CONFLICT'
            ? 409
            : 400;
  return { status, body: { error: err.code, message: err.message, details: err.details } };
};

export function registerHiringContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'hiring',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: HIRING_EVENTS,
    rbac: hiringRbac,
    subscribers: hiringSubscribers(),
    errorMapper: hiringErrorMapper,
    flags: hiringFlags,
    routes: { mountAt: '/', build: buildHiringRoutes },
  });
}
