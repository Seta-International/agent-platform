import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Mastra } from '@mastra/core';
import type { ContributionRegistry } from '@seta/core';
import type { SubscriberDef } from '@seta/shared-types';
import type { Hono } from 'hono';
import type { Pool } from 'pg';
import { createAgentFactory } from './backend/agent-factory.ts';
import {
  refreshUserProfileCreatedSubscriber,
  refreshUserProfileDeactivatedSubscriber,
  refreshUserProfileUpdatedSubscriber,
} from './backend/embeddings/subscribers/refresh-user-profile.ts';
import { registerCopilotRoutes } from './backend/routes.ts';
import { buildMastra } from './backend/runtime.ts';
import { makeOnPlannerTaskCreatedSubscriber } from './backend/subscribers/on-planner-task-created.ts';
import { registerNewTaskSkillTagWorkflow } from './backend/workflows/new-task-skill-tag/index.ts';
import * as schema from './db/schema.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Late-bound Mastra reference. registerCopilotContributions() registers subscribers
// at composition time (before any runtime deps exist); registerCopilot(deps) builds
// the Mastra instance and parks it here so subscriber handlers can reach it. Single
// instance per process by design — never re-assigned across builds.
let mastraRef: Mastra | null = null;

function getMastraOrNull(): Mastra | null {
  return mastraRef;
}

function setMastraRef(mastra: Mastra): void {
  mastraRef = mastra;
}

function copilotSubscribers(): SubscriberDef[] {
  return [
    makeOnPlannerTaskCreatedSubscriber({
      get mastra() {
        const m = getMastraOrNull();
        if (!m) {
          throw new Error('copilot subscriber invoked before Mastra runtime was built');
        }
        return m;
      },
    } as never),
    refreshUserProfileCreatedSubscriber,
    refreshUserProfileUpdatedSubscriber,
    refreshUserProfileDeactivatedSubscriber,
  ];
}

export function registerCopilotContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'copilot',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
    subscribers: copilotSubscribers(),
  });
}

export type CopilotHandle = {
  attach: (app: Hono) => void;
};

export function registerCopilot(deps: {
  pool: Pool;
  databaseUrl: string;
  reg: ContributionRegistry;
}): CopilotHandle {
  const mastra = buildMastra({ pool: deps.pool, databaseUrl: deps.databaseUrl });
  registerNewTaskSkillTagWorkflow(mastra);
  void mastra.startWorkers();
  setMastraRef(mastra);
  const factory = createAgentFactory({
    mastra,
    pool: deps.pool,
    agentTools: deps.reg.collected.agentTools,
  });
  return {
    attach(app) {
      registerCopilotRoutes(app as never, { factory, mastra, pool: deps.pool });
    },
  };
}
