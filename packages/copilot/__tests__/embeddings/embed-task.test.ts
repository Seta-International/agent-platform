import { resetCoreDb } from '@seta/core/internal/test-support';
import { buildTaskSource } from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedTaskForTest } from '../../../planner/tests/helpers/seed.ts';
import { embedTask } from '../../src/backend/embeddings/embed-task.ts';

// Helper: wrap pool in front of a fake provider so we can count embed calls.
function makeSpy(base: FakeEmbeddingProvider) {
  const spy = vi.spyOn(base, 'embed');
  return spy;
}

function withDb<T>(fn: (ctx: { pool: import('pg').Pool }) => Promise<T>): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

describe('embedTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts a single row for a short task (single-vector)', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const seeded = await seedTaskForTest(pool, {
        title: 'short',
        description: 'few tokens',
        skill_tags: ['x'],
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e1' },
        { pool, provider },
      );

      const rows = await pool.query(
        `SELECT chunk_ordinal, source_hash, model_id
           FROM planner.task_embeddings
          WHERE tenant_id = $1 AND task_id = $2
          ORDER BY chunk_ordinal`,
        [seeded.tenant_id, seeded.task_id],
      );

      expect(rows.rows).toHaveLength(1);
      const row = rows.rows[0] as { chunk_ordinal: number; source_hash: string; model_id: string };
      expect(row.chunk_ordinal).toBe(0);
      expect(row.source_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.model_id).toBe(provider.modelId);

      // Verify the stored hash matches what buildTaskSource + sourceHash produces.
      const source = buildTaskSource({
        title: 'short',
        description: 'few tokens',
        skill_tags: ['x'],
      });
      expect(row.source_hash).toBe(sourceHash(source));
    });
  });

  it('hash gate: embed is called only once for two identical calls', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const embedSpy = makeSpy(provider);

      const seeded = await seedTaskForTest(pool, {
        title: 'same title',
        description: 'same description',
        skill_tags: ['go'],
      });

      const payload = { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e2' };
      const deps = { pool, provider };

      await embedTask(payload, deps);
      await embedTask(payload, deps);

      // embed() batches chunks; for a single short chunk it's called once total.
      expect(embedSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('deletion path: 0 rows after soft-delete + embed call', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      // Seed and embed once.
      const seeded = await seedTaskForTest(pool, {
        title: 'will be deleted',
        description: 'some description',
        skill_tags: [],
      });
      const payload = { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e3' };
      await embedTask(payload, { pool, provider });

      // Confirm row was inserted.
      const before = await pool.query(
        `SELECT COUNT(*)::int AS n FROM planner.task_embeddings WHERE tenant_id = $1 AND task_id = $2`,
        [seeded.tenant_id, seeded.task_id],
      );
      expect((before.rows[0] as { n: number }).n).toBeGreaterThan(0);

      // Soft-delete the task.
      await pool.query(`UPDATE planner.tasks SET deleted_at = now() WHERE id = $1`, [
        seeded.task_id,
      ]);

      // Call embedTask again — should delete the embedding rows.
      await embedTask(payload, { pool, provider });

      const after = await pool.query(
        `SELECT COUNT(*)::int AS n FROM planner.task_embeddings WHERE tenant_id = $1 AND task_id = $2`,
        [seeded.tenant_id, seeded.task_id],
      );
      expect((after.rows[0] as { n: number }).n).toBe(0);
    });
  });

  it('produces >= 2 rows with sequential ordinals for a long description', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      // Build a description long enough to exceed 1000 tokens (~1500 words ≈ 2000 tokens).
      const longDescription = Array.from(
        { length: 200 },
        (_, i) =>
          `Paragraph ${i}: This is a detailed description of the task that includes many technical terms and explanations. The quick brown fox jumps over the lazy dog multiple times.`,
      ).join('\n\n');

      const seeded = await seedTaskForTest(pool, {
        title: 'Long task',
        description: longDescription,
        skill_tags: ['typescript', 'postgres', 'embeddings'],
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e4' },
        { pool, provider },
      );

      const rows = await pool.query(
        `SELECT chunk_ordinal FROM planner.task_embeddings
          WHERE tenant_id = $1 AND task_id = $2
          ORDER BY chunk_ordinal`,
        [seeded.tenant_id, seeded.task_id],
      );

      expect(rows.rows.length).toBeGreaterThanOrEqual(2);
      // Ordinals must be sequential starting from 0.
      rows.rows.forEach((row: { chunk_ordinal: number }, idx: number) => {
        expect(row.chunk_ordinal).toBe(idx);
      });
    });
  });

  it('lazy partition: per-tenant partition is created on first embed', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const seeded = await seedTaskForTest(pool, {
        title: 'partition test',
        description: null,
        skill_tags: [],
      });

      const slug = seeded.tenant_id.replaceAll('-', '_');
      const partitionName = `task_embeddings_${slug}`;

      // Partition must not exist before the call.
      const before = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = $1 AND n.nspname = 'planner'
         ) AS exists`,
        [partitionName],
      );
      expect(before.rows[0]?.exists).toBe(false);

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e5' },
        { pool, provider },
      );

      // Partition must exist after the call.
      const after = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = $1 AND n.nspname = 'planner'
         ) AS exists`,
        [partitionName],
      );
      expect(after.rows[0]?.exists).toBe(true);
    });
  });
});
