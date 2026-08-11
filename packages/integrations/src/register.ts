import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper, SessionEnv, WorkerHandle } from '@seta/core';
import { getEntraTenantId } from '@seta/identity';
import type { Crypto } from '@seta/shared-crypto';
import { getLifecycleEntries, registerLifecycle } from '@seta/shared-db';
import type { MailerEnv } from '@seta/shared-mailer';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as schema from './backend/db/schema/index.ts';
import { registerMailTransportRoutes } from './backend/http/index.ts';
import { buildM365Boot } from './backend/m365/boot.ts';
import { buildM365Subscribers } from './backend/m365/subscribers.ts';
import { INTEGRATIONS_PERMISSIONS, IntegrationsError } from './backend/rbac.ts';
import { integrationsRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Nightly M365 directory sync (design §10). The task name is snake_case, not the design's
 * literal `m365.directory.pull-cron`: graphile-worker's `CRONTAB_COMMAND` allows
 * `[_a-zA-Z][_a-zA-Z0-9:/_-]*` only, so a dotted task makes the whole crontab unparseable and
 * `run()` rejects — the worker would fail to boot rather than skip the line.
 */
const M365_CRONTAB = '30 2 * * * m365_directory_pull_cron';

export interface IntegrationsRegisterDeps {
  cryptoSvc?: Crypto;
  mailerEnv?: MailerEnv;
  webhookSecret?: string;
  getWorkers?: () => WorkerHandle;
}

// requirePermission's raw `missing permission <slug>` message leaks the permission slug
// straight to the UI (FUT-4) — swap known ones for user-facing copy before it reaches the client.
const FRIENDLY_FORBIDDEN_MESSAGES: Partial<Record<string, string>> = {
  [`missing permission ${INTEGRATIONS_PERMISSIONS.mailConfigure}`]:
    "You don't have permission to configure mail settings. Ask your workspace admin for access.",
};

// Domain errors from the mail-transport routes (RBAC checks, tenant mismatch, bad
// input, failed test-send) were thrown uncaught — with no mapper claiming
// `IntegrationsError`, they fell through to the generic handler as a bare 500
// instead of the intended 403/400/404 (FUT-4).
export const integrationsErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof IntegrationsError)) return null;
  const status: ContentfulStatusCode =
    err.code === 'FORBIDDEN' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400; // INVALID_INPUT, TRANSPORT_VERIFY_FAILED
  const message = FRIENDLY_FORBIDDEN_MESSAGES[err.message] ?? err.message;
  return { status, body: { error: err.code, message } };
};

export function registerIntegrationsContributions(
  reg: ContributionRegistry,
  deps: IntegrationsRegisterDeps = {},
): void {
  // Tests construct a fresh ContributionRegistry per call (often several times per
  // process), but the shared-db lifecycle registry is process-global and throws on
  // re-registering a table — skip if a prior call in this process already ran.
  if (!getLifecycleEntries().some((e) => e.table === 'integrations.m365_group_links')) {
    registerLifecycle([
      { table: 'integrations.m365_group_links', policy: { kind: 'permanent' } },
      { table: 'integrations.m365_subscriptions', policy: { kind: 'permanent' } },
      { table: 'integrations.m365_plan_links', policy: { kind: 'permanent' } },
      { table: 'integrations.m365_resource_etags', policy: { kind: 'permanent' } },
      { table: 'integrations.m365_tenant_config', policy: { kind: 'permanent' } },
      { table: 'integrations.mail_transport_config', policy: { kind: 'permanent' } },
      { table: 'integrations.m365_person_links', policy: { kind: 'permanent' } },
      { table: 'integrations.m365_org_unit_links', policy: { kind: 'permanent' } },
      { table: 'integrations.m365_directory_conflict', policy: { kind: 'permanent' } },
    ]);
  }

  const m365Boot =
    deps.webhookSecret && deps.cryptoSvc && deps.getWorkers
      ? buildM365Boot({
          webhookSecret: deps.webhookSecret,
          cryptoSvc: deps.cryptoSvc,
          getWorkers: deps.getWorkers,
        })
      : null;

  const { cryptoSvc, mailerEnv } = deps;
  const routes =
    m365Boot || (cryptoSvc && mailerEnv)
      ? {
          mountAt: '/',
          build: (rtDeps: Parameters<NonNullable<typeof m365Boot>['buildRoutes']>[0]) => {
            const app: Hono<SessionEnv> = m365Boot
              ? m365Boot.buildRoutes(rtDeps)
              : new Hono<SessionEnv>();
            if (cryptoSvc && mailerEnv) {
              registerMailTransportRoutes(app, {
                cryptoSvc,
                mailerEnv,
                lookupEntraTenantId: getEntraTenantId,
              });
            }
            return app;
          },
        }
      : null;

  reg.module({
    name: 'integrations',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    rbac: integrationsRbac,
    subscribers: buildM365Subscribers(),
    errorMapper: integrationsErrorMapper,
    // Contributed only alongside the jobs that serve it: graphile-worker does not check a
    // crontab line against the task list, so a line shipped without its handler would enqueue a
    // failing job every night forever (design §10).
    ...(m365Boot ? { jobs: m365Boot.jobs, crontab: M365_CRONTAB } : {}),
    ...(routes ? { routes } : {}),
  });
}
