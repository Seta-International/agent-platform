import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './backend/db/schema.ts';
import { EVALUATION_EVENTS } from './events.ts';
import { evaluationRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerEvaluationContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'evaluation',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: EVALUATION_EVENTS,
    rbac: evaluationRbac,
  });
}
