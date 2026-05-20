import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './db/schema/index.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerIntegrationsContributions(reg: ContributionRegistry): void {
  reg.schema('integrations', schema);
  reg.migrationsDir('integrations', resolve(__dirname, '../drizzle/migrations'));
  reg.subscribers([]);
  reg.publicApi('integrations', {});
}
