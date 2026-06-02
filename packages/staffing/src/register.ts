import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentTool } from '@seta/agent-sdk';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './backend/db/schema.ts';
import { staffingWorkflows } from './backend/workflows/index.ts';
import { STAFFING_EVENTS } from './events.ts';
import { STAFFING_PERMISSIONS } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const STAFFING_RBAC: Record<string, string> = Object.fromEntries(
  STAFFING_PERMISSIONS.map((p) => [p, p]),
);

export function registerStaffingContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'staffing',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: STAFFING_EVENTS,
    rbac: STAFFING_RBAC,
    // Staffing exposes no standalone engine tools: each specialized agent owns
    // its focused tools internally (see orchestration/agents/*.tools.ts), built
    // and wired by buildStaffingOrchestrationRuntime, not the contribution bus.
    agentTools: [] as AgentTool[],
    agentSpecs: [],
    workflows: staffingWorkflows,
    subscriberBuilders: [],
  });
}
