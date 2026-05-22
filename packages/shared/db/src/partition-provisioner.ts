import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

export interface EnsureTenantPartitionOptions {
  /** Qualified parent table name, e.g. 'planner.task_embeddings'. */
  parent: string;
  /** Column to index with HNSW, e.g. 'embedding'. */
  embeddingColumn: string;
  /** Tenant UUID. */
  tenantId: string;
  /** Additional columns to btree-index per-partition. */
  secondaryIndexColumns?: string[];
  /**
   * Override the generated HNSW index name. Required when the auto-generated name
   * `${parentName}_${slug}_hnsw_idx` would exceed Postgres's 63-byte identifier limit.
   * Must itself be ≤ 63 bytes.
   */
  hnswIndexName?: string;
  /** pgvector opclass. */
  opclass: 'halfvec_cosine_ops' | 'halfvec_l2_ops' | 'vector_cosine_ops';
  /** HNSW build params. */
  hnsw: { m: number; efConstruction: number };
}

/**
 * Idempotently provision a per-tenant partition + HNSW + btree indexes for a
 * partitioned embeddings table. Guarded by pg_advisory_xact_lock keyed on
 * sha256(parent || tenant_id) so concurrent worker processes do not race.
 *
 * Identifier inputs (parent, embeddingColumn, opclass, secondaryIndexColumns entries)
 * are interpolated raw into SQL — Postgres cannot parameterize identifiers.
 * Callers must supply these from trusted internal config, never user input.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ensureTenantPartition(
  pool: Pool,
  opts: EnsureTenantPartitionOptions,
): Promise<void> {
  if (!UUID_RE.test(opts.tenantId)) {
    throw new Error(`tenantId must be a UUID, got ${opts.tenantId}`);
  }
  const slug = opts.tenantId.replaceAll('-', '_');
  const [parentSchema, parentName] = opts.parent.split('.');
  if (!parentSchema || !parentName) {
    throw new Error(`parent must be 'schema.table', got ${opts.parent}`);
  }
  const childName = `${parentName}_${slug}`;
  const hnswIndex = opts.hnswIndexName ?? `${childName}_hnsw_idx`;

  // Guard against PG silently truncating identifiers at 63 bytes — throw early,
  // before any SQL runs, so the caller gets a clear error instead of a corrupt index name.
  if (hnswIndex.length > 63) {
    throw new Error(
      `Generated HNSW index name '${hnswIndex}' is ${hnswIndex.length} chars; Postgres truncates identifiers at 63.`,
    );
  }
  for (const col of opts.secondaryIndexColumns ?? []) {
    const idx = `${childName}_${col}_idx`;
    if (idx.length > 63) {
      throw new Error(
        `Generated index name '${idx}' is ${idx.length} chars; Postgres truncates identifiers at 63. Shorten the parent table name or the column name.`,
      );
    }
  }

  // pg_advisory_xact_lock(classid int4, id int4): take first 8 bytes of the SHA-256 digest
  // as two signed 32-bit big-endian values to fill both lock-key slots.
  const digest = createHash('sha256').update(`${opts.parent}|${opts.tenantId}`).digest();
  const k1 = digest.readInt32BE(0);
  const k2 = digest.readInt32BE(4);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [k1, k2]);

    const childCheck = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = $1 AND n.nspname = $2
       ) AS exists`,
      [childName, parentSchema],
    );
    if (childCheck.rows[0]?.exists) {
      await client.query('COMMIT');
      return;
    }

    // CREATE TABLE ... PARTITION OF ... FOR VALUES IN (...) cannot be parameterized;
    // Postgres rejects $N in partition bound expressions. The tenantId is UUID-validated
    // above, so inlining as a quoted literal is safe.
    await client.query(
      `CREATE TABLE ${parentSchema}.${childName}
         PARTITION OF ${parentSchema}.${parentName}
         FOR VALUES IN ('${opts.tenantId}'::uuid)`,
    );

    await client.query(
      `CREATE INDEX ${hnswIndex}
         ON ${parentSchema}.${childName}
         USING hnsw (${opts.embeddingColumn} ${opts.opclass})
         WITH (m = ${opts.hnsw.m}, ef_construction = ${opts.hnsw.efConstruction})`,
    );

    for (const col of opts.secondaryIndexColumns ?? []) {
      const idx = `${childName}_${col}_idx`;
      await client.query(`CREATE INDEX ${idx} ON ${parentSchema}.${childName} (${col})`);
    }

    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // connection is already dead; the ROLLBACK error is not actionable
    }
    throw err;
  } finally {
    client.release();
  }
}
