import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './backend/db/schema.ts';
import { PM_EVENTS } from './events.ts';
import { pmRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerPmContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'pm',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: PM_EVENTS,
    rbac: pmRbac,
  });
}
