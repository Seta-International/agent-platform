import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import { getLifecycleEntries, registerLifecycle } from '@seta/shared-db';
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
  // Tests construct a fresh ContributionRegistry per call (often several times per process),
  // but the shared-db lifecycle registry is process-global and throws on re-registering a
  // table — skip if a prior call in this process already ran.
  if (!getLifecycleEntries().some((e) => e.table === 'people.person')) {
    registerLifecycle([
      { table: 'people.person', policy: { kind: 'permanent' } },
      { table: 'people.employment_period', policy: { kind: 'permanent' } },
      { table: 'people.org_unit', policy: { kind: 'permanent' } },
      { table: 'people.person_skill', policy: { kind: 'permanent' } },
      { table: 'people.person_history', policy: { kind: 'permanent' } },
      { table: 'people.worker_allocation_projection', policy: { kind: 'permanent' } },
      { table: 'people.account_projection', policy: { kind: 'permanent' } },
      { table: 'people.project_projection', policy: { kind: 'permanent' } },
      { table: 'people.performance_evaluation_group', policy: { kind: 'permanent' } },
      { table: 'people.performance_config_revision', policy: { kind: 'permanent' } },
      { table: 'people.performance_config_group_weight', policy: { kind: 'permanent' } },
      { table: 'people.performance_config_criterion', policy: { kind: 'permanent' } },
      { table: 'people.performance_config_month_pin', policy: { kind: 'permanent' } },
    ]);
  }

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
