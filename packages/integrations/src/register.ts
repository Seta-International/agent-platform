import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, WorkerHandle } from '@seta/core';
import type { Crypto } from '@seta/shared-crypto';
import * as schema from './db/schema/index.ts';
import { buildM365Boot } from './m365/boot.ts';
import { buildM365Subscribers } from './m365/subscribers.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export interface IntegrationsRegisterDeps {
  cryptoSvc?: Crypto;
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

  reg.module({
    name: 'integrations',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    subscribers: buildM365Subscribers(),
    ...(m365Boot ? { jobs: m365Boot.jobs } : {}),
    ...(m365Boot ? { routes: { mountAt: '/', build: m365Boot.buildRoutes } } : {}),
  });
}
