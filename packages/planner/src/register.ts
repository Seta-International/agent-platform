import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import { plannerSubscribers } from './backend/subscribers/index.ts';
import * as schema from './db/schema.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerPlannerContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'planner',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
    subscribers: plannerSubscribers(),
  });
}
