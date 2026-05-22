import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './db/schema/index.ts';
import { buildM365Subscribers } from './m365/subscribers.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerIntegrationsContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'integrations',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    subscribers: buildM365Subscribers(),
  });
}
