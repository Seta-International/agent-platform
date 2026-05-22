import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedTaskForTest } from '../../../tests/helpers/seed.ts';
import { embedTask } from '../embed-task.ts';
import { buildTaskSource } from '../source.ts';

function makeSpy(base: FakeEmbeddingProvider) {
  return vi.spyOn(base, 'embed');
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
        `SELECT plan_id, source_hash, model_id
           FROM planner.task_embeddings
          WHERE tenant_id = $1 AND task_id = $2`,
        [seeded.tenant_id, seeded.task_id],
      );

      expect(rows.rows).toHaveLength(1);
      const row = rows.rows[0] as { plan_id: string; source_hash: string; model_id: string };
      expect(row.plan_id).toBe(seeded.plan_id);
      expect(row.source_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.model_id).toBe(provider.modelId);

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

      expect(embedSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('deletion path: 0 rows after soft-delete + embed call', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      const seeded = await seedTaskForTest(pool, {
        title: 'will be deleted',
        description: 'some description',
        skill_tags: [],
      });
      const payload = { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e3' };
      await embedTask(payload, { pool, provider });

      const before = await pool.query(
        `SELECT COUNT(*)::int AS n FROM planner.task_embeddings WHERE tenant_id = $1 AND task_id = $2`,
        [seeded.tenant_id, seeded.task_id],
      );
      expect((before.rows[0] as { n: number }).n).toBeGreaterThan(0);

      await pool.query(`UPDATE planner.tasks SET deleted_at = now() WHERE id = $1`, [
        seeded.task_id,
      ]);

      await embedTask(payload, { pool, provider });

      const after = await pool.query(
        `SELECT COUNT(*)::int AS n FROM planner.task_embeddings WHERE tenant_id = $1 AND task_id = $2`,
        [seeded.tenant_id, seeded.task_id],
      );
      expect((after.rows[0] as { n: number }).n).toBe(0);
    });
  });

  it('skip-input-too-long: skips embedding when source exceeds MAX_SOURCE_TOKENS', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const embedSpy = vi.spyOn(provider, 'embed');

      const longDesc = Array.from({ length: 1100 }, () => 'word').join(' ');

      const seeded = await seedTaskForTest(pool, {
        title: 'too long',
        description: longDesc,
        skill_tags: [],
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e1' },
        { pool, provider },
      );

      expect(embedSpy).not.toHaveBeenCalled();

      const rows = await pool.query(
        `SELECT 1 FROM planner.task_embeddings WHERE tenant_id = $1 AND task_id = $2`,
        [seeded.tenant_id, seeded.task_id],
      );
      expect(rows.rowCount).toBe(0);
    });
  });

  it('skip-keeps-stale-row: previously-embedded row stays when source grows past the limit', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      const seeded = await seedTaskForTest(pool, {
        title: 'short',
        description: 'fits fine',
        skill_tags: [],
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e1' },
        { pool, provider },
      );

      const before = await pool.query<{ source_hash: string; embedded_at: Date }>(
        `SELECT source_hash, embedded_at FROM planner.task_embeddings
          WHERE tenant_id = $1 AND task_id = $2`,
        [seeded.tenant_id, seeded.task_id],
      );
      expect(before.rowCount).toBe(1);
      const beforeRow = before.rows[0]!;

      const longDesc = Array.from({ length: 1100 }, () => 'word').join(' ');
      await pool.query(`UPDATE planner.tasks SET description = $1 WHERE id = $2`, [
        longDesc,
        seeded.task_id,
      ]);

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e2' },
        { pool, provider },
      );

      const after = await pool.query<{ source_hash: string; embedded_at: Date }>(
        `SELECT source_hash, embedded_at FROM planner.task_embeddings
          WHERE tenant_id = $1 AND task_id = $2`,
        [seeded.tenant_id, seeded.task_id],
      );
      expect(after.rowCount).toBe(1);
      expect(after.rows[0]!.source_hash).toBe(beforeRow.source_hash);
      expect(after.rows[0]!.embedded_at.getTime()).toBe(beforeRow.embedded_at.getTime());
    });
  });

  it('skip-recovers-when-shrunk: re-embeds once the source falls back under the limit', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      const longDesc = Array.from({ length: 1100 }, () => 'word').join(' ');
      const seeded = await seedTaskForTest(pool, {
        title: 'recover',
        description: longDesc,
        skill_tags: [],
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e1' },
        { pool, provider },
      );
      let rows = await pool.query(
        `SELECT 1 FROM planner.task_embeddings WHERE tenant_id = $1 AND task_id = $2`,
        [seeded.tenant_id, seeded.task_id],
      );
      expect(rows.rowCount).toBe(0);

      await pool.query(`UPDATE planner.tasks SET description = $1 WHERE id = $2`, [
        'now fits',
        seeded.task_id,
      ]);

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e2' },
        { pool, provider },
      );

      rows = await pool.query(
        `SELECT source_hash, model_id FROM planner.task_embeddings
          WHERE tenant_id = $1 AND task_id = $2`,
        [seeded.tenant_id, seeded.task_id],
      );
      expect(rows.rowCount).toBe(1);
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
