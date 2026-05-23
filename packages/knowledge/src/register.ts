import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './backend/db/schema.ts';
import { KNOWLEDGE_EVENTS } from './events.ts';
import { KNOWLEDGE_PERMISSIONS } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerKnowledgeContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'knowledge',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: KNOWLEDGE_EVENTS,
    rbac: KNOWLEDGE_PERMISSIONS,
  });
}
