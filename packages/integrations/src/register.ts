import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, SessionEnv, WorkerHandle } from '@seta/core';
import { getEntraTenantId } from '@seta/identity';
import type { Crypto } from '@seta/shared-crypto';
import { getLifecycleEntries, registerLifecycle } from '@seta/shared-db';
import type { MailerEnv } from '@seta/shared-mailer';
import { Hono } from 'hono';
import * as schema from './backend/db/schema/index.ts';
import { registerMailTransportRoutes } from './backend/http/index.ts';
import { buildM365Boot } from './backend/m365/boot.ts';
import { buildM365Subscribers } from './backend/m365/subscribers.ts';
import { integrationsRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export interface IntegrationsRegisterDeps {
  cryptoSvc?: Crypto;
  mailerEnv?: MailerEnv;
  webhookSecret?: string;
  getWorkers?: () => WorkerHandle;
}

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
    ...(m365Boot ? { jobs: m365Boot.jobs } : {}),
    ...(routes ? { routes } : {}),
  });
}
