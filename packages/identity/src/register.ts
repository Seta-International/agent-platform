import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './db/schema.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerIdentityContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'identity',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
  });
}
