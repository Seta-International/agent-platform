import { backfillTasks as defaultBackfillTasks } from '@seta/copilot/backend/embeddings/backfill/backfill-tasks';
import { getPool, type Pool } from '@seta/shared-db';

export interface EmbedBackfillArgs {
  module: string;
  tenant: string;
}

export interface EmbedBackfillDeps {
  backfillTasks?: typeof defaultBackfillTasks;
  env?: Record<string, string | undefined>;
  pool?: Pool;
}

export async function runEmbedBackfill(
  args: EmbedBackfillArgs,
  deps: EmbedBackfillDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;

  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');

  if (args.module !== 'planner') {
    throw new Error(`unsupported module: ${args.module} (planner only in M3.2)`);
  }

  const backfill = deps.backfillTasks ?? defaultBackfillTasks;
  const pool = deps.pool ?? getPool('worker');
  const model =
    (env.EMBED_MODEL as 'text-embedding-3-small' | 'text-embedding-3-large') ??
    'text-embedding-3-small';

  await backfill({
    tenant_id: args.tenant,
    pool,
    apiKey: env.OPENAI_API_KEY,
    model,
  });
}
