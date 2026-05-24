import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Mastra } from '@mastra/core';
import type { SubscriberBuilder } from '@seta/copilot-sdk';
import type { ContributionRegistry } from '@seta/core';
import { staffingAgentTools } from './agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import { makeOnPlannerTaskCreatedSubscriber } from './backend/subscribers/on-planner-task-created.ts';
import { staffingWorkflows } from './backend/workflows/index.ts';
import { classifySkillsSpec } from './backend/workflows/new-task-skill-tag/agents/classify-skills.ts';
import { STAFFING_EVENTS } from './events.ts';
import { STAFFING_PERMISSIONS } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const STAFFING_RBAC: Record<string, string> = Object.fromEntries(
  STAFFING_PERMISSIONS.map((p) => [p, p]),
);

const onPlannerTaskCreatedBuilder: SubscriberBuilder = ({ mastra }) =>
  makeOnPlannerTaskCreatedSubscriber({ mastra: mastra as Mastra });

export function registerStaffingContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'staffing',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: STAFFING_EVENTS,
    rbac: STAFFING_RBAC,
    agentTools: staffingAgentTools,
    agentSpecs: [classifySkillsSpec],
    workflows: staffingWorkflows,
    subscriberBuilders: [onPlannerTaskCreatedBuilder],
  });
}
