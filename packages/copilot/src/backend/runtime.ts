import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import type { Pool } from 'pg';

export type CopilotRuntimeDeps = {
  pool: Pool;
  databaseUrl: string;
};

export function buildMastra(deps: CopilotRuntimeDeps): Mastra {
  const storage = new PostgresStore({
    id: 'copilot-store',
    schemaName: 'copilot',
    pool: deps.pool,
  });
  return new Mastra({
    storage,
    logger: false,
  });
}
