import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMastra } from '@seta/copilot/register';
import type { ContributionRegistry } from '@seta/core';
import { staffingAgentTools } from './agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import { makeOnPlannerTaskCreatedSubscriber } from './backend/subscribers/on-planner-task-created.ts';
import { staffingWorkflows } from './backend/workflows/index.ts';
import { STAFFING_EVENTS } from './events.ts';
import { STAFFING_PERMISSIONS } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerStaffingContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'staffing',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: STAFFING_EVENTS,
    rbac: STAFFING_PERMISSIONS,
    agentTools: staffingAgentTools,
    workflows: staffingWorkflows,
    subscribers: [
      makeOnPlannerTaskCreatedSubscriber({
        get mastra() {
          return getMastra();
        },
      } as never),
    ],
  });
}
