import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './backend/db/schema.ts';
import { HIRING_EVENTS } from './events.ts';
import { hiringRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerHiringContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'hiring',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: HIRING_EVENTS,
    rbac: hiringRbac,
  });
}
