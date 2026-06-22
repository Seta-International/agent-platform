import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import { performanceAgentSpecs } from './backend/agent-specs.ts';
import { performanceAgentTools } from './backend/agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import { setDataAccess } from './backend/domain/data-access.ts';
import { makeDbDataAccess } from './backend/domain/db-data-access.ts';
import { PERFORMANCE_EVENTS } from './events.ts';
import { performanceRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerPerformanceContributions(reg: ContributionRegistry): void {
  // Back the agent tools with the real `performance.*` schema (Drizzle). Unit
  // tests don't call this, so they keep the in-memory mock / fixtures.
  setDataAccess(makeDbDataAccess());

  reg.module({
    name: 'performance',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: PERFORMANCE_EVENTS,
    rbac: performanceRbac,
    agentTools: performanceAgentTools,
    agentSpecs: performanceAgentSpecs,
  });
}
