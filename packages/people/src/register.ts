import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as schema from './backend/db/schema.ts';
import { buildPeopleRoutes } from './backend/http/index.ts';
import { PeopleError } from './backend/rbac.ts';
import { peopleSubscribers } from './backend/subscribers/index.ts';
import { PEOPLE_EVENTS } from './events.ts';
import { peopleRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const peopleErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof PeopleError)) return null;
  const status: ContentfulStatusCode =
    err.code === 'FORBIDDEN'
      ? 403
      : err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'CONFLICT'
          ? 409
          : 400;
  return { status, body: { error: err.code, message: err.message, details: err.details } };
};

export function registerPeopleContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'people',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: PEOPLE_EVENTS,
    rbac: peopleRbac,
    subscribers: peopleSubscribers(),
    routes: { mountAt: '/', build: buildPeopleRoutes },
    errorMapper: peopleErrorMapper,
  });
}
