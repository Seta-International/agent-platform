// scripts/dev/seed-golden-dataset-embed.ts
//
// Generates the RAG embeddings for the golden dataset — planner_rag
// (task_embeddings) and people_rag (person_profile_embeddings) — for the
// golden tenant, so semantic search / people-matching testcases work.
//
// `seedGoldenDataset` only writes relational rows; it never embeds. This
// wrapper runs the real backfill pipeline (mirrors `apps/cli embed-backfill`)
// for both modules against the golden tenant.
//
// Must run AFTER `pnpm seed:golden`. Idempotent — vectors are upserted by a
// deterministic id ({tenant}:{task_or_person_id}).
//
// NOTE: this uses the OpenAI *Batch* API, which is asynchronous with up to a
// 24h completion window. The process polls until the batch finishes and only
// then writes the vectors, so keep it running to the end — killing it leaves
// the batch to complete on OpenAI's side with nothing to fetch the results.
//
// Requires OPENAI_API_KEY. Model via EMBED_MODEL (default openai/text-embedding-3-small).
//
// Usage:
//   pnpm seed:golden:embed
//   DATABASE_URL=postgresql://... OPENAI_API_KEY=sk-... pnpm seed:golden:embed

import { backfillPersonProfiles, getPeopleVectorStore } from '@seta/people';
import { backfillTasks, getPlannerVectorStore } from '@seta/planner';
import pg from 'pg';
import { TENANT_ID } from '../../packages/planner/tests/fixtures/golden/index.ts';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://seta:seta@localhost:5542/seta';

function resolveModel(): 'text-embedding-3-small' | 'text-embedding-3-large' {
  const embedModel = process.env.EMBED_MODEL ?? 'openai/text-embedding-3-small';
  const slash = embedModel.indexOf('/');
  const provider = slash > 0 ? embedModel.slice(0, slash) : '';
  const modelName = slash > 0 ? embedModel.slice(slash + 1) : embedModel;
  if (provider !== 'openai') {
    throw new Error(
      `seed:golden:embed uses the OpenAI Batch API; EMBED_MODEL must be an openai/* model, got "${embedModel}"`,
    );
  }
  return modelName as 'text-embedding-3-small' | 'text-embedding-3-large';
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required');
  const model = resolveModel();

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    console.log(
      `Embedding planner tasks (model ${model})... uses the OpenAI Batch API and may take minutes.`,
    );
    await backfillTasks({
      tenant_id: TENANT_ID,
      pool,
      pgVector: getPlannerVectorStore(DATABASE_URL),
      apiKey,
      model,
    });
    console.log('  planner_rag done.');

    console.log('Embedding people profiles...');
    await backfillPersonProfiles({
      tenant_id: TENANT_ID,
      pool,
      pgVector: getPeopleVectorStore(DATABASE_URL),
      apiKey,
      model,
    });
    console.log('  people_rag done.');

    console.log('\nGolden dataset embeddings ready.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
