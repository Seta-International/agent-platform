import { buildUserProfileSource, getUserProfileForEmbedding } from '@seta/identity';
import { ensureTenantPartition } from '@seta/shared-db';
import { type EmbeddingProvider, embedMany, sourceHash } from '@seta/shared-embeddings';
import type { Pool } from 'pg';

export interface EmbedUserProfilePayload {
  tenant_id: string;
  user_id: string;
  event_id: string;
}

export interface EmbedUserProfileDeps {
  pool: Pool;
  provider: EmbeddingProvider;
}

/**
 * CDC pipeline handler for embed_user_profile jobs.
 *
 * Sequence:
 * 1. Fetch profile via getUserProfileForEmbedding (returns null for deactivated users).
 * 2. If null → DELETE any stale row and return.
 * 3. Build source text via buildUserProfileSource. If empty → DELETE and return.
 * 4. Hash-gate: skip if source_hash is unchanged.
 * 5. Ensure per-tenant HNSW partition exists.
 * 6. Embed the single source text.
 * 7. UPSERT into identity.user_profile_embeddings.
 */
export async function embedUserProfile(
  payload: EmbedUserProfilePayload,
  deps: EmbedUserProfileDeps,
): Promise<void> {
  const { tenant_id, user_id } = payload;

  // Step 1: fetch profile (null when user is deactivated or missing).
  const profile = await getUserProfileForEmbedding({ tenant_id, user_id });

  // Step 2: deletion path — user is gone or deactivated.
  if (profile == null) {
    await deps.pool.query(
      `DELETE FROM identity.user_profile_embeddings WHERE tenant_id = $1 AND user_id = $2`,
      [tenant_id, user_id],
    );
    return;
  }

  // Step 3: build source text; empty string means nothing to embed.
  const source = buildUserProfileSource(profile);
  if (source === '') {
    await deps.pool.query(
      `DELETE FROM identity.user_profile_embeddings WHERE tenant_id = $1 AND user_id = $2`,
      [tenant_id, user_id],
    );
    return;
  }

  const hash = sourceHash(source);

  // Step 4: hash-gate — skip if source unchanged.
  const existing = await deps.pool.query<{ source_hash: string }>(
    `SELECT source_hash FROM identity.user_profile_embeddings
       WHERE tenant_id = $1 AND user_id = $2
       LIMIT 1`,
    [tenant_id, user_id],
  );
  if (existing.rows[0]?.source_hash === hash) {
    return;
  }

  // Step 5: ensure per-tenant partition + HNSW index.
  // hnswIndexName override: the auto-generated name 'user_profile_embeddings_${slug}_hnsw_idx'
  // is 65 chars, exceeding Postgres's 63-byte limit. 'upe_${slug}_hnsw_idx' is 45 chars.
  const slug = tenant_id.replaceAll('-', '_');
  await ensureTenantPartition(deps.pool, {
    parent: 'identity.user_profile_embeddings',
    embeddingColumn: 'embedding',
    tenantId: tenant_id,
    hnswIndexName: `upe_${slug}_hnsw_idx`,
    opclass: 'halfvec_cosine_ops',
    hnsw: { m: 16, efConstruction: 200 },
  });

  // Step 6: embed the single source text.
  const vectors = await embedMany(deps.provider, [source]);
  const vec = vectors[0];
  if (!vec) throw new Error('embedMany returned no vector for user profile source');

  // Step 7: upsert the single embedding row.
  await deps.pool.query(
    `INSERT INTO identity.user_profile_embeddings
       (tenant_id, user_id, source_hash, embedding, model_id, embedded_at)
     VALUES ($1, $2, $3, $4::halfvec, $5, now())
     ON CONFLICT (tenant_id, user_id)
     DO UPDATE SET
       source_hash = EXCLUDED.source_hash,
       embedding   = EXCLUDED.embedding,
       model_id    = EXCLUDED.model_id,
       embedded_at = EXCLUDED.embedded_at`,
    [tenant_id, user_id, hash, `[${vec.join(',')}]`, deps.provider.modelId],
  );
}
