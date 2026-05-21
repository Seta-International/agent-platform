import { buildTaskSource, getTaskForEmbedding } from '@seta/planner';
import { ensureTenantPartition } from '@seta/shared-db';
import {
  countTokens,
  type EmbeddingProvider,
  embedMany,
  sourceHash,
} from '@seta/shared-embeddings';
import type { Pool } from 'pg';

export interface EmbedTaskPayload {
  tenant_id: string;
  task_id: string;
  event_id: string;
}

export interface EmbedTaskDeps {
  pool: Pool;
  provider: EmbeddingProvider;
}

interface Chunk {
  ordinal: number;
  text: string;
}

/**
 * Split source text into overlapping chunks of approximately `size` tokens with
 * `overlap` token overlap. Splits on paragraph boundaries first, then word
 * boundaries, to preserve coherent prose segments.
 *
 * @mastra/rag is not in the workspace; this implements the same "recursive"
 * strategy (paragraph → sentence → word fallback) without that dependency.
 */
function chunkText(source: string, size: number, overlap: number): string[] {
  const totalTokens = countTokens(source);
  if (totalTokens <= size) return [source];

  // Try splitting on double-newlines (paragraph boundaries) first.
  const paragraphs = source.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (countTokens(candidate) > size && current) {
      chunks.push(current.trim());
      // Carry back `overlap` tokens worth of text into the next chunk.
      const words = current.split(/\s+/);
      let overlapText = '';
      for (let i = words.length - 1; i >= 0; i--) {
        const candidate2 = words.slice(i).join(' ');
        if (countTokens(candidate2) <= overlap) {
          overlapText = candidate2;
        } else {
          break;
        }
      }
      current = overlapText ? `${overlapText}\n\n${para}` : para;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // If any chunk still exceeds `size` (single very long paragraph), split on
  // spaces (word boundaries) as a fallback.
  const result: string[] = [];
  for (const chunk of chunks) {
    if (countTokens(chunk) <= size) {
      result.push(chunk);
    } else {
      // Word-level split
      const words = chunk.split(/\s+/);
      let wCurrent: string[] = [];
      for (const word of words) {
        const candidate = [...wCurrent, word].join(' ');
        if (countTokens(candidate) > size && wCurrent.length > 0) {
          result.push(wCurrent.join(' '));
          // Carry overlap words forward.
          let overlapWords: string[] = [];
          for (let i = wCurrent.length - 1; i >= 0; i--) {
            const ow = wCurrent.slice(i);
            if (countTokens(ow.join(' ')) <= overlap) {
              overlapWords = ow;
            } else {
              break;
            }
          }
          wCurrent = [...overlapWords, word];
        } else {
          wCurrent.push(word);
        }
      }
      if (wCurrent.length > 0) result.push(wCurrent.join(' '));
    }
  }
  return result.length > 0 ? result : [source];
}

/**
 * Core CDC pipeline handler for embed_task jobs.
 *
 * Sequence:
 * 1. Fetch task (skips soft-deleted rows).
 * 2. If missing → delete any stale embeddings rows and return.
 * 3. Build source text → sha256 hash.
 * 4. Hash-gate: skip if source unchanged (checks chunk_ordinal=0 row).
 * 5. Conditionally chunk: ≤1000 tokens → one chunk; else split into 512-token
 *    chunks with 50-token overlap.
 * 6. Ensure per-tenant HNSW partition exists.
 * 7. Embed all chunks via embedMany (batched + retried).
 * 8. In a single transaction: DELETE old rows → bulk INSERT new rows.
 */
export async function embedTask(payload: EmbedTaskPayload, deps: EmbedTaskDeps): Promise<void> {
  const { tenant_id, task_id } = payload;

  // Step 1: fetch task (getTaskForEmbedding skips soft-deleted rows).
  const task = await getTaskForEmbedding({ tenant_id, task_id });

  // Step 2: deletion path — task is gone or soft-deleted.
  if (task == null) {
    await deps.pool.query(
      `DELETE FROM planner.task_embeddings WHERE tenant_id = $1 AND task_id = $2`,
      [tenant_id, task_id],
    );
    return;
  }

  // Step 3: build source text and hash.
  const source = buildTaskSource(task);
  const hash = sourceHash(source);

  // Step 4: hash-gate — check existing source_hash for chunk_ordinal=0.
  const existing = await deps.pool.query<{ source_hash: string }>(
    `SELECT source_hash FROM planner.task_embeddings
       WHERE tenant_id = $1 AND task_id = $2 AND chunk_ordinal = 0
       LIMIT 1`,
    [tenant_id, task_id],
  );
  if (existing.rows[0]?.source_hash === hash) {
    // Source unchanged; nothing to do.
    return;
  }

  // Step 5: chunk the source text.
  const TOKEN_LIMIT = 1000;
  const CHUNK_SIZE = 512;
  const CHUNK_OVERLAP = 50;

  let chunks: Chunk[];
  if (countTokens(source) <= TOKEN_LIMIT) {
    chunks = [{ ordinal: 0, text: source }];
  } else {
    const texts = chunkText(source, CHUNK_SIZE, CHUNK_OVERLAP);
    chunks = texts.map((text, i) => ({ ordinal: i, text }));
  }

  // Step 6: ensure per-tenant partition + HNSW index.
  // secondaryIndexColumns omitted: the PK on (tenant_id, task_id, chunk_ordinal)
  // already covers task_id lookups within each child partition. A separate btree
  // index named `task_embeddings_{slug}_task_id_idx` would exceed Postgres's
  // 63-byte identifier limit for real tenant UUIDs.
  await ensureTenantPartition(deps.pool, {
    parent: 'planner.task_embeddings',
    embeddingColumn: 'embedding',
    tenantId: tenant_id,
    opclass: 'halfvec_cosine_ops',
    hnsw: { m: 16, efConstruction: 200 },
  });

  // Step 7: embed all chunk texts.
  const vectors = await embedMany(
    deps.provider,
    chunks.map((c) => c.text),
  );

  // Step 8: transactional DELETE + bulk INSERT.
  const client = await deps.pool.connect();
  try {
    await client.query('BEGIN');

    // Remove stale rows (handles fewer-chunks transitions atomically).
    await client.query(
      `DELETE FROM planner.task_embeddings WHERE tenant_id = $1 AND task_id = $2`,
      [tenant_id, task_id],
    );

    // Build bulk INSERT with parameterized placeholders.
    // Fixed params: $1=tenant_id, $2=task_id, $3=hash, $4=model_id
    // Per-chunk params starting at $5: chunk_ordinal, chunk_text, embedding
    const placeholders: string[] = [];
    const params: unknown[] = [tenant_id, task_id, hash, deps.provider.modelId];
    let p = params.length; // currently 4

    for (const c of chunks) {
      const iOrdinal = ++p;
      const iText = ++p;
      const iEmbedding = ++p;
      placeholders.push(
        `($1, $2, $${iOrdinal}, $${iText}, $3, $${iEmbedding}::halfvec, $4, now())`,
      );
      const vec = vectors[c.ordinal];
      if (!vec) throw new Error(`Missing vector for chunk ordinal ${c.ordinal}`);
      params.push(c.ordinal, c.text, `[${vec.join(',')}]`);
    }

    await client.query(
      `INSERT INTO planner.task_embeddings
         (tenant_id, task_id, chunk_ordinal, chunk_text, source_hash, embedding, model_id, embedded_at)
       VALUES ${placeholders.join(', ')}`,
      params,
    );

    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Connection already dead; ROLLBACK error is not actionable.
    }
    throw err;
  } finally {
    client.release();
  }
}
