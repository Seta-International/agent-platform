import { ensureTenantPartition } from '@seta/shared-db';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { countTokens, embedMany, sourceHash } from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import { buildTaskSource } from '../../src/embeddings/source.ts';

export interface EmbedTaskForTestOptions {
  tenant_id: string;
  task_id: string;
  title: string;
  description: string | null;
  skill_tags: string[];
  provider: EmbeddingProvider;
}

interface Chunk {
  ordinal: number;
  text: string;
}

/**
 * Split source text into overlapping chunks of approximately `size` tokens with
 * `overlap` token overlap. Mirrors the chunking logic in copilot's embed-task.ts.
 */
function chunkText(source: string, size: number, overlap: number): string[] {
  const totalTokens = countTokens(source);
  if (totalTokens <= size) return [source];

  const paragraphs = source.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (countTokens(candidate) > size && current) {
      chunks.push(current.trim());
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

  const result: string[] = [];
  for (const chunk of chunks) {
    if (countTokens(chunk) <= size) {
      result.push(chunk);
    } else {
      const words = chunk.split(/\s+/);
      let wCurrent: string[] = [];
      for (const word of words) {
        const candidate = [...wCurrent, word].join(' ');
        if (countTokens(candidate) > size && wCurrent.length > 0) {
          result.push(wCurrent.join(' '));
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
 * Test-only helper that mirrors what copilot's embedTask does but lives entirely
 * inside the planner package (avoids planner→copilot test devDep cycle).
 *
 * Builds source via buildTaskSource, chunks if needed, ensures the tenant
 * partition, embeds via the provider, and bulk-inserts into task_embeddings.
 */
export async function embedTaskForTest(pool: Pool, opts: EmbedTaskForTestOptions): Promise<void> {
  const { tenant_id, task_id, title, description, skill_tags, provider } = opts;

  const source = buildTaskSource({ title, description, skill_tags });
  const hash = sourceHash(source);

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

  await ensureTenantPartition(pool, {
    parent: 'planner.task_embeddings',
    embeddingColumn: 'embedding',
    tenantId: tenant_id,
    opclass: 'halfvec_cosine_ops',
    hnsw: { m: 16, efConstruction: 200 },
  });

  const vectors = await embedMany(
    provider,
    chunks.map((c) => c.text),
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM planner.task_embeddings WHERE tenant_id = $1 AND task_id = $2`,
      [tenant_id, task_id],
    );

    const placeholders: string[] = [];
    const params: unknown[] = [tenant_id, task_id, hash, provider.modelId];
    let p = params.length;

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
