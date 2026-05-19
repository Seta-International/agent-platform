import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './db/schema.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerIdentityContributions(reg: ContributionRegistry): void {
  reg.schema('identity', schema);
  reg.migrationsDir('identity', resolve(__dirname, '../drizzle'));
  reg.subscribers([]);
  reg.publicApi('identity', {});
}
