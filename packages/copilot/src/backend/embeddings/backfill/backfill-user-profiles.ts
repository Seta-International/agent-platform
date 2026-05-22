import { buildUserProfileSource, listUsersForBackfill } from '@seta/identity';
import { ensureTenantPartition } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import {
  type BatchInputRow,
  type BatchResultRow,
  pollUntilDone as defaultPoll,
  submitBatch as defaultSubmit,
  type OpenAIBatchClient,
  type SubmitOptions,
} from './openai-batch.ts';

export type { BatchInputRow, BatchResultRow };

const PAGE_SIZE = 1000;

export interface BackfillUserProfilesOptions {
  tenant_id: string;
  pool: Pool;
  apiKey: string;
  model: 'text-embedding-3-small' | 'text-embedding-3-large';
  /** Injectable for tests — defaults to the real submitBatch */
  submitBatch?: typeof defaultSubmit;
  /** Injectable for tests — defaults to the real pollUntilDone */
  pollUntilDone?: typeof defaultPoll;
}

/**
 * Drain a tenant's active user profiles into identity.user_profile_embeddings
 * via the OpenAI Batch API.
 *
 * Sequence:
 * 1. Ensure the per-tenant HNSW partition exists.
 * 2. Page through active users with non-empty skills (keyset cursor, PAGE_SIZE=1000).
 * 3. For each page: hash-gate → submit batch → poll → upsert in a transaction.
 *
 * One row per user (no chunk_ordinal). ON CONFLICT upserts replace stale rows.
 */
export async function backfillUserProfiles(opts: BackfillUserProfilesOptions): Promise<void> {
  const {
    tenant_id,
    pool,
    apiKey,
    model,
    submitBatch: submit = defaultSubmit,
    pollUntilDone: poll = defaultPoll,
  } = opts;

  const modelId = `openai:${model}`;

  // Step 1: ensure per-tenant partition + HNSW index.
  // hnswIndexName override: auto-generated 'user_profile_embeddings_${slug}_hnsw_idx'
  // is 65 chars, exceeding Postgres's 63-byte limit. 'upe_${slug}_hnsw_idx' is 45 chars.
  const slug = tenant_id.replaceAll('-', '_');
  await ensureTenantPartition(pool, {
    parent: 'identity.user_profile_embeddings',
    embeddingColumn: 'embedding',
    tenantId: tenant_id,
    hnswIndexName: `upe_${slug}_hnsw_idx`,
    opclass: 'halfvec_cosine_ops',
    hnsw: { m: 16, efConstruction: 200 },
  });

  // Step 2: keyset-paginate through active users with non-empty skills.
  let cursor = '00000000-0000-0000-0000-000000000000';
  const submitOpts: SubmitOptions = { apiKey, model };
  const pollOpts: OpenAIBatchClient = { apiKey };

  while (true) {
    const page = await listUsersForBackfill({ tenant_id, cursor, limit: PAGE_SIZE, pool });

    if (page.length === 0) break;

    cursor = page[page.length - 1]!.user_id;

    // Step 3a: build source text + hash for each row.
    const sourced = page.map((row) => {
      const source = buildUserProfileSource({ skills: row.skills });
      return { user_id: row.user_id, source, hash: sourceHash(source) };
    });

    // Step 3b: hash-gate — load existing source_hash for users on this page.
    const pageIds = page.map((r) => r.user_id);
    const existingResult = await pool.query<{ user_id: string; source_hash: string }>(
      `SELECT user_id, source_hash
         FROM identity.user_profile_embeddings
        WHERE tenant_id = $1
          AND user_id = ANY($2::uuid[])`,
      [tenant_id, pageIds],
    );
    const existingByUser = new Map<string, string>(
      existingResult.rows.map((r) => [r.user_id, r.source_hash]),
    );

    // Filter out rows whose hash is already current.
    const toEmbed = sourced.filter((s) => existingByUser.get(s.user_id) !== s.hash);

    if (toEmbed.length === 0) {
      if (page.length < PAGE_SIZE) break;
      continue;
    }

    // Step 3c: build batch inputs and submit.
    const batchInputs: BatchInputRow[] = toEmbed.map((s) => ({
      custom_id: s.user_id,
      input: s.source,
    }));

    const batchId = await submit(submitOpts, batchInputs);
    const batchResults: BatchResultRow[] = await poll(pollOpts, batchId);

    const vectorByUser = new Map<string, number[]>(
      batchResults.map((r) => [r.custom_id, r.vector]),
    );
    const sourceByUser = new Map<string, { source: string; hash: string }>(
      toEmbed.map((s) => [s.user_id, { source: s.source, hash: s.hash }]),
    );

    // Step 3d: transactional UPSERT — one row per user, no chunk_ordinal.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const placeholders: string[] = [];
      const params: unknown[] = [tenant_id, modelId];
      let p = 2;

      for (const { user_id } of toEmbed) {
        const vec = vectorByUser.get(user_id);
        if (!vec) continue;
        const meta = sourceByUser.get(user_id);
        if (!meta) continue;

        const iUserId = ++p;
        const iSourceHash = ++p;
        const iEmbedding = ++p;

        placeholders.push(`($1, $${iUserId}, $${iSourceHash}, $${iEmbedding}::halfvec, $2, now())`);
        params.push(user_id, meta.hash, `[${vec.join(',')}]`);
      }

      if (placeholders.length > 0) {
        await client.query(
          `INSERT INTO identity.user_profile_embeddings
             (tenant_id, user_id, source_hash, embedding, model_id, embedded_at)
           VALUES ${placeholders.join(', ')}
           ON CONFLICT (tenant_id, user_id)
           DO UPDATE SET
             source_hash = EXCLUDED.source_hash,
             embedding   = EXCLUDED.embedding,
             model_id    = EXCLUDED.model_id,
             embedded_at = EXCLUDED.embedded_at`,
          params,
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Connection already dead.
      }
      throw err;
    } finally {
      client.release();
    }

    if (page.length < PAGE_SIZE) break;
  }
}
