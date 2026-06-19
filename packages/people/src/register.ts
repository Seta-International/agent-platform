import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './backend/db/schema.ts';
import { PEOPLE_EVENTS } from './events.ts';
import { peopleRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerPeopleContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'people',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: PEOPLE_EVENTS,
    rbac: peopleRbac,
  });
}
