import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Mastra } from '@mastra/core';
import type { ContributionRegistry } from '@seta/core';
import type { Hono } from 'hono';
import type { Pool } from 'pg';
import { createAgentFactory } from './backend/agent-factory.ts';
import { registerCopilotRoutes } from './backend/routes.ts';
import { buildMastra } from './backend/runtime.ts';
import * as schema from './db/schema.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Single-process Mastra singleton. registerCopilot(deps) builds it; orchestrator
// modules (staffing, future task-assistant, etc.) reach it from their subscribers
// via getMastra() through @seta/copilot's public surface.
let mastraRef: Mastra | null = null;

export function getMastra(): Mastra {
  if (!mastraRef) {
    throw new Error('mastra runtime not built yet — call registerCopilot(deps) first');
  }
  return mastraRef;
}

function setMastraRef(mastra: Mastra): void {
  mastraRef = mastra;
}

export function registerCopilotContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'copilot',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
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
  for (const { builder } of deps.reg.collected.workflowBuilders) {
    builder(mastra);
  }
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
