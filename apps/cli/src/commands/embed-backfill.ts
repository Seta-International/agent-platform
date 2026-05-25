import {
  backfillUserProfiles as defaultBackfillUserProfiles,
  getIdentityVectorStore,
} from '@seta/identity';
import { backfillTasks as defaultBackfillTasks, getPlannerVectorStore } from '@seta/planner';
import { getPool, type Pool } from '@seta/shared-db';

export interface EmbedBackfillArgs {
  module: string;
  tenant: string;
}

export interface EmbedBackfillDeps {
  backfillTasks?: typeof defaultBackfillTasks;
  backfillUserProfiles?: typeof defaultBackfillUserProfiles;
  env?: Record<string, string | undefined>;
  pool?: Pool;
}

export async function runEmbedBackfill(
  args: EmbedBackfillArgs,
  deps: EmbedBackfillDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;

  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');

  const model =
    (env.EMBED_MODEL as 'text-embedding-3-small' | 'text-embedding-3-large') ??
    'text-embedding-3-small';

  if (args.module === 'planner') {
    const pool = deps.pool ?? getPool('worker');
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL required for planner embed backfill');
    const pgVector = getPlannerVectorStore(databaseUrl);
    const backfill = deps.backfillTasks ?? defaultBackfillTasks;
    await backfill({
      tenant_id: args.tenant,
      pool,
      pgVector,
      apiKey: env.OPENAI_API_KEY,
      model,
    });
    return;
  }

  if (args.module === 'identity') {
    const pool = deps.pool ?? getPool('worker');
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL required for identity embed backfill');
    const pgVector = getIdentityVectorStore(databaseUrl);
    const backfill = deps.backfillUserProfiles ?? defaultBackfillUserProfiles;
    await backfill({
      tenant_id: args.tenant,
      pool,
      pgVector,
      apiKey: env.OPENAI_API_KEY,
      model,
    });
    return;
  }

  throw new Error(`unsupported module: ${args.module}`);
}
