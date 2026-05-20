import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import type { Hono } from 'hono';
import type { Pool } from 'pg';
import { createAgentFactory } from './backend/agent-factory.ts';
import { registerCopilotRoutes } from './backend/routes.ts';
import { buildMastra } from './backend/runtime.ts';
import * as schema from './db/schema.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerCopilotContributions(reg: ContributionRegistry): void {
  reg.schema('copilot', schema);
  reg.migrationsDir('copilot', resolve(__dirname, '../drizzle'));
  reg.subscribers([]);
  reg.publicApi('copilot', {});
}

export type CopilotHandle = {
  attach: (app: Hono) => void;
};

export function registerCopilot(deps: { pool: Pool; databaseUrl: string }): CopilotHandle {
  const mastra = buildMastra({ pool: deps.pool, databaseUrl: deps.databaseUrl });
  const factory = createAgentFactory({ mastra });
  return {
    attach(app) {
      registerCopilotRoutes(app as never, { factory, mastra });
    },
  };
}
