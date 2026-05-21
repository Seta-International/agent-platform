import { randomUUID } from 'node:crypto';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { ensureTenantPartition } from '../src/partition-provisioner.ts';

const env = {
  template: () => process.env.SETA_TEST_PG_TEMPLATE as string,
  base: () => process.env.SETA_TEST_PG_BASE as string,
};

/**
 * Minimal partitioned parent table that mirrors planner.task_embeddings's shape
 * enough to exercise the provisioner. Inlining avoids importing planner's
 * migration registry from shared/db (which would invert the dep graph).
 *
 * The parent is named 'planner.te' (shortened from 'task_embeddings') so that
 * generated identifier names stay under PG's 63-byte limit when the
 * secondaryIndexColumn 'task_id' is appended.
 */
async function createParent(pool: import('pg').Pool): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS planner`);
  await pool.query(`
    CREATE TABLE planner.te (
      tenant_id     uuid          NOT NULL,
      task_id       bigint        NOT NULL,
      chunk_ordinal integer       NOT NULL,
      embedding     halfvec(1536) NOT NULL,
      PRIMARY KEY (tenant_id, task_id, chunk_ordinal)
    ) PARTITION BY LIST (tenant_id)
  `);
}

describe('ensureTenantPartition', () => {
  it('creates a partition + HNSW + secondary indexes, and is a no-op on the second call', async () => {
    await withTestDb({ templateDbName: env.template(), baseUrl: env.base() }, async ({ pool }) => {
      await createParent(pool);
      const tenantId = randomUUID();
      const slug = tenantId.replaceAll('-', '_');

      const config = {
        parent: 'planner.te',
        embeddingColumn: 'embedding',
        tenantId,
        secondaryIndexColumns: ['task_id'],
        opclass: 'halfvec_cosine_ops' as const,
        hnsw: { m: 16, efConstruction: 200 },
      };

      await ensureTenantPartition(pool, config);

      const childExists = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
             SELECT 1 FROM pg_class c
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relname = $1 AND n.nspname = 'planner'
           ) AS exists`,
        [`te_${slug}`],
      );
      expect(childExists.rows[0]?.exists).toBe(true);

      const hnswExists = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
             SELECT 1 FROM pg_indexes
              WHERE schemaname = 'planner' AND indexname = $1
           ) AS exists`,
        [`te_${slug}_hnsw_idx`],
      );
      expect(hnswExists.rows[0]?.exists).toBe(true);

      const btreeExists = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
             SELECT 1 FROM pg_indexes
              WHERE schemaname = 'planner' AND indexname = $1
           ) AS exists`,
        [`te_${slug}_task_id_idx`],
      );
      expect(btreeExists.rows[0]?.exists).toBe(true);

      // Second call is a no-op (no error, idempotent).
      await ensureTenantPartition(pool, config);
    });
  });

  it('concurrent calls race-safely on the advisory lock', async () => {
    await withTestDb({ templateDbName: env.template(), baseUrl: env.base() }, async ({ pool }) => {
      await createParent(pool);
      const tenantId = randomUUID();
      const slug = tenantId.replaceAll('-', '_');

      const config = {
        parent: 'planner.te',
        embeddingColumn: 'embedding',
        tenantId,
        secondaryIndexColumns: ['task_id'],
        opclass: 'halfvec_cosine_ops' as const,
        hnsw: { m: 16, efConstruction: 200 },
      };

      await Promise.all(Array.from({ length: 5 }, () => ensureTenantPartition(pool, config)));

      const childCount = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = $1 AND n.nspname = 'planner'`,
        [`te_${slug}`],
      );
      expect(childCount.rows[0]?.n).toBe(1);

      const hnswCount = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_indexes
            WHERE schemaname = 'planner' AND indexname = $1`,
        [`te_${slug}_hnsw_idx`],
      );
      expect(hnswCount.rows[0]?.n).toBe(1);

      const btreeCount = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_indexes
            WHERE schemaname = 'planner' AND indexname = $1`,
        [`te_${slug}_task_id_idx`],
      );
      expect(btreeCount.rows[0]?.n).toBe(1);
    });
  });

  it('throws when the generated index name would exceed Postgres 63-byte identifier limit', async () => {
    await expect(
      ensureTenantPartition(
        // pool is not needed — the throw happens before any SQL runs
        null as unknown as import('pg').Pool,
        {
          parent: 'planner.task_embeddings_with_a_very_long_name',
          embeddingColumn: 'embedding',
          tenantId: randomUUID(),
          secondaryIndexColumns: ['some_long_column'],
          opclass: 'halfvec_cosine_ops',
          hnsw: { m: 16, efConstruction: 200 },
        },
      ),
    ).rejects.toThrow(/63/);
  });
});
