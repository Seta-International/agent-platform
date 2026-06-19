import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import { performanceAgentSpecs } from './backend/agent-specs.ts';
import { performanceAgentTools } from './backend/agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import { PERFORMANCE_EVENTS } from './events.ts';
import { performanceRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerPerformanceContributions(reg: ContributionRegistry): void {
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
