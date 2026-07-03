import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import { getLifecycleEntries, registerLifecycle } from '@seta/shared-db';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as schema from './backend/db/schema.ts';
import { buildHiringRoutes } from './backend/http/index.ts';
import { HiringError } from './backend/rbac.ts';
import { hiringSubscribers } from './backend/subscribers/index.ts';
import { HIRING_EVENTS } from './events.ts';
import { hiringRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const hiringErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof HiringError)) return null;
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

export function registerHiringContributions(reg: ContributionRegistry): void {
  // Tests construct a fresh ContributionRegistry per call (often several times per process),
  // but the shared-db lifecycle registry is process-global and throws on re-registering a
  // table — skip if a prior call in this process already ran.
  if (!getLifecycleEntries().some((e) => e.table === 'hiring.requisition')) {
    registerLifecycle([
      { table: 'hiring.requisition', policy: { kind: 'permanent' } },
      { table: 'hiring.opening', policy: { kind: 'permanent' } },
      { table: 'hiring.requisition_jd_section', policy: { kind: 'permanent' } },
      { table: 'hiring.requisition_skill', policy: { kind: 'permanent' } },
      { table: 'hiring.opening_close_reason', policy: { kind: 'permanent' } },
      { table: 'hiring.jd_template', policy: { kind: 'permanent' } },
      { table: 'hiring.jd_template_section', policy: { kind: 'permanent' } },
      { table: 'hiring.candidate', policy: { kind: 'permanent' } },
      { table: 'hiring.candidate_skill', policy: { kind: 'permanent' } },
      { table: 'hiring.rejection_reason', policy: { kind: 'permanent' } },
      { table: 'hiring.candidate_event', policy: { kind: 'permanent' } },
      { table: 'hiring.application', policy: { kind: 'permanent' } },
    ]);
  }

  reg.module({
    name: 'hiring',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: HIRING_EVENTS,
    rbac: hiringRbac,
    subscribers: hiringSubscribers(),
    errorMapper: hiringErrorMapper,
    routes: { mountAt: '/', build: buildHiringRoutes },
  });
}
