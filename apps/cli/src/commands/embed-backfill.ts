import {
  backfillPersonProfiles as defaultBackfillPersonProfiles,
  getPeopleVectorStore,
} from '@seta/people';
import { backfillTasks as defaultBackfillTasks, getPlannerVectorStore } from '@seta/planner';
import { getPool, type Pool } from '@seta/shared-db';

export interface EmbedBackfillArgs {
  module: string;
  tenant: string;
}

export interface EmbedBackfillDeps {
  backfillTasks?: typeof defaultBackfillTasks;
  backfillPersonProfiles?: typeof defaultBackfillPersonProfiles;
  env?: Record<string, string | undefined>;
  pool?: Pool;
}

export async function runEmbedBackfill(
  args: EmbedBackfillArgs,
  deps: EmbedBackfillDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;

  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');

  const embedModel = env.EMBED_MODEL ?? 'openai/text-embedding-3-small';
  const slash = embedModel.indexOf('/');
  const provider = slash > 0 ? embedModel.slice(0, slash) : '';
  const modelName = slash > 0 ? embedModel.slice(slash + 1) : embedModel;
  if (provider !== 'openai') {
    throw new Error(
      `embed-backfill uses the OpenAI Batch API; EMBED_MODEL must be an openai/* model, got "${embedModel}"`,
    );
  }
  const model = modelName as 'text-embedding-3-small' | 'text-embedding-3-large';

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

  if (args.module === 'people') {
    const pool = deps.pool ?? getPool('worker');
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL required for people embed backfill');
    const pgVector = getPeopleVectorStore(databaseUrl);
    const backfill = deps.backfillPersonProfiles ?? defaultBackfillPersonProfiles;
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
