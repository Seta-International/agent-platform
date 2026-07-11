import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import { getLifecycleEntries, registerLifecycle } from '@seta/shared-db';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as schema from './backend/db/schema.ts';
import { buildPmRoutes } from './backend/http/index.ts';
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
      : err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'CONFLICT'
          ? 409
          : 400;
  return { status, body: { error: err.code, message: err.message, details: err.details } };
};

export function registerPmContributions(reg: ContributionRegistry): void {
  // Tests construct a fresh ContributionRegistry per call (often several times per process),
  // but the shared-db lifecycle registry is process-global and throws on re-registering a
  // table — skip if a prior call in this process already ran.
  if (!getLifecycleEntries().some((e) => e.table === 'pm.account')) {
    registerLifecycle([
      { table: 'pm.account', policy: { kind: 'permanent' } },
      { table: 'pm.project', policy: { kind: 'permanent' } },
      { table: 'pm.account_recruiter', policy: { kind: 'permanent' } },
      { table: 'pm.allocation', policy: { kind: 'permanent' } },
      { table: 'pm.project_access', policy: { kind: 'permanent' } },
      { table: 'pm.worker_projection', policy: { kind: 'permanent' } },
      { table: 'pm.staffing_plan_line', policy: { kind: 'permanent' } },
      { table: 'pm.staffing_plan_line_skill', policy: { kind: 'permanent' } },
    ]);
  }

  reg.module({
    name: 'pm',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: PM_EVENTS,
    rbac: pmRbac,
    subscribers: pmSubscribers(),
    errorMapper: pmErrorMapper,
    routes: { mountAt: '/', build: buildPmRoutes },
  });
}
