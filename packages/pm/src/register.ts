import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as schema from './backend/db/schema.ts';
import { PmError } from './backend/rbac.ts';
import { pmSubscribers } from './backend/subscribers/index.ts';
import { PM_EVENTS } from './events.ts';
import { pmRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const pmErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof PmError)) return null;
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

export function registerPmContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'pm',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: PM_EVENTS,
    rbac: pmRbac,
    subscribers: pmSubscribers(),
    errorMapper: pmErrorMapper,
  });
}
