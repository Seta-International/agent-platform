import { backfillTasks as defaultBackfillTasks } from '@seta/copilot/backend/embeddings/backfill/backfill-tasks';
import { backfillUserProfiles as defaultBackfillUserProfiles } from '@seta/copilot/backend/embeddings/backfill/backfill-user-profiles';
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
    const backfill = deps.backfillTasks ?? defaultBackfillTasks;
    await backfill({ tenant_id: args.tenant, pool, apiKey: env.OPENAI_API_KEY, model });
    return;
  }

  if (args.module === 'identity') {
    const pool = deps.pool ?? getPool('worker');
    const backfill = deps.backfillUserProfiles ?? defaultBackfillUserProfiles;
    await backfill({ tenant_id: args.tenant, pool, apiKey: env.OPENAI_API_KEY, model });
    return;
  }

  throw new Error(`unsupported module: ${args.module}`);
}
