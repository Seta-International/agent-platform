import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, SessionEnv, WorkerHandle } from '@seta/core';
import { getEntraTenantId } from '@seta/identity';
import type { Crypto } from '@seta/shared-crypto';
import type { MailerEnv } from '@seta/shared-mailer';
import { Hono } from 'hono';
import { registerMailTransportRoutes } from './backend/http/index.ts';
import * as schema from './db/schema/index.ts';
import { buildM365Boot } from './m365/boot.ts';
import { buildM365Subscribers } from './m365/subscribers.ts';

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
    subscribers: buildM365Subscribers(),
    ...(m365Boot ? { jobs: m365Boot.jobs } : {}),
    ...(routes ? { routes } : {}),
  });
}
