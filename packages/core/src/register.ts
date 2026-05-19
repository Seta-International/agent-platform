import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from './composition/registry.ts';
import * as schema from './db/schema/index.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerCoreContributions(reg: ContributionRegistry): void {
  reg.schema('core', schema);
  reg.migrationsDir('core', resolve(__dirname, '../drizzle/migrations'));
  reg.subscribers([]);
  reg.publicApi('core', {});
}
