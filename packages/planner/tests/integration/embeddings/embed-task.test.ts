import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import {
  PLANNER_VECTOR_INDEX,
  PLANNER_VECTOR_NAMESPACE,
  type TaskVectorMetadata,
  taskVectorId,
} from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { embedTask } from '../../../src/backend/embeddings/embed-task.ts';
import { buildTaskSource } from '../../../src/backend/embeddings/source.ts';
import { seedTaskForTest } from '../../helpers/seed.ts';

function makeSpy(base: FakeEmbeddingProvider) {
  return vi.spyOn(base, 'embed');
}

function withDb<T>(
  fn: (ctx: { pool: import('pg').Pool; pgVector: PgVector }) => Promise<T>,
): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      const pgVector = new PgVector({
        id: 'planner-task-embeddings-test',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        return await fn({ pool, pgVector });
      } finally {
        await pgVector.disconnect().catch(() => {});
        resetCoreDb();
        await closePools();
      }
    },
  );
}

async function fetchVector(
  pgVector: PgVector,
  tenantId: string,
  taskId: string,
): Promise<TaskVectorMetadata | undefined> {
  try {
    const rows = await pgVector.query({
      indexName: PLANNER_VECTOR_INDEX,
      filter: { tenant_id: { $eq: tenantId }, task_id: { $eq: taskId } },
      topK: 1,
    });
    return rows[0]?.metadata as TaskVectorMetadata | undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('does not exist')) return undefined;
    throw err;
  }
}

describe('embedTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('upserts a single vector for a short task', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const seeded = await seedTaskForTest(pool, {
        title: 'short',
        description: 'few tokens',
        labels: ['x'],
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e1' },
        { provider, pgVector },
      );

      const meta = await fetchVector(pgVector, seeded.tenant_id, seeded.task_id);
      expect(meta).toBeDefined();
      expect(meta!.plan_id).toBe(seeded.plan_id);
      expect(meta!.source_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(meta!.model_id).toBe(provider.modelId);

      const source = buildTaskSource({
        title: 'short',
        description: 'few tokens',
        labels: ['x'],
      });
      expect(meta!.source_hash).toBe(sourceHash(source));
      expect(meta!.tenant_id).toBe(seeded.tenant_id);
      expect(meta!.task_id).toBe(seeded.task_id);
    });
  });

  it('hash gate: embed is called only once for two identical calls', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const embedSpy = makeSpy(provider);

      const seeded = await seedTaskForTest(pool, {
        title: 'same title',
        description: 'same description',
        labels: ['go'],
      });

      const payload = { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e2' };
      const deps = { provider, pgVector };

      await embedTask(payload, deps);
      await embedTask(payload, deps);

      expect(embedSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('deletion path: vector row removed after soft-delete + embed call', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const seeded = await seedTaskForTest(pool, {
        title: 'will be deleted',
        description: 'some description',
      });
      const payload = { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e3' };
      await embedTask(payload, { provider, pgVector });

      const before = await fetchVector(pgVector, seeded.tenant_id, seeded.task_id);
      expect(before).toBeDefined();

      await pool.query(`UPDATE planner.tasks SET deleted_at = now() WHERE id = $1`, [
        seeded.task_id,
      ]);

      await embedTask(payload, { provider, pgVector });

      const after = await fetchVector(pgVector, seeded.tenant_id, seeded.task_id);
      expect(after).toBeUndefined();
    });
  });

  it('skip-input-too-long: skips embedding when source exceeds MAX_SOURCE_TOKENS', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const embedSpy = vi.spyOn(provider, 'embed');

      const longDesc = Array.from({ length: 1100 }, () => 'word').join(' ');

      const seeded = await seedTaskForTest(pool, {
        title: 'too long',
        description: longDesc,
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e1' },
        { provider, pgVector },
      );

      expect(embedSpy).not.toHaveBeenCalled();

      const meta = await fetchVector(pgVector, seeded.tenant_id, seeded.task_id);
      expect(meta).toBeUndefined();
    });
  });

  it('skip-keeps-stale-row: previously-embedded row stays when source grows past the limit', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const seeded = await seedTaskForTest(pool, {
        title: 'short',
        description: 'fits fine',
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e1' },
        { provider, pgVector },
      );

      const before = await fetchVector(pgVector, seeded.tenant_id, seeded.task_id);
      expect(before).toBeDefined();
      const beforeHash = before!.source_hash;
      const beforeAt = before!.embedded_at;

      const longDesc = Array.from({ length: 1100 }, () => 'word').join(' ');
      await pool.query(`UPDATE planner.tasks SET description = $1 WHERE id = $2`, [
        longDesc,
        seeded.task_id,
      ]);

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e2' },
        { provider, pgVector },
      );

      const after = await fetchVector(pgVector, seeded.tenant_id, seeded.task_id);
      expect(after).toBeDefined();
      expect(after!.source_hash).toBe(beforeHash);
      expect(after!.embedded_at).toBe(beforeAt);
    });
  });

  it('skip-recovers-when-shrunk: re-embeds once the source falls back under the limit', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const longDesc = Array.from({ length: 1100 }, () => 'word').join(' ');
      const seeded = await seedTaskForTest(pool, {
        title: 'recover',
        description: longDesc,
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e1' },
        { provider, pgVector },
      );
      const skipped = await fetchVector(pgVector, seeded.tenant_id, seeded.task_id);
      expect(skipped).toBeUndefined();

      await pool.query(`UPDATE planner.tasks SET description = $1 WHERE id = $2`, [
        'now fits',
        seeded.task_id,
      ]);

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e2' },
        { provider, pgVector },
      );

      const after = await fetchVector(pgVector, seeded.tenant_id, seeded.task_id);
      expect(after).toBeDefined();
      expect(after!.model_id).toBe(provider.modelId);
    });
  });

  it('deterministic vector_id: upsert replaces prior chunk for the same (tenant, task) pair', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const seeded = await seedTaskForTest(pool, {
        title: 'initial',
        description: 'first version',
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e1' },
        { provider, pgVector },
      );

      await pool.query(`UPDATE planner.tasks SET title = $1 WHERE id = $2`, [
        'second',
        seeded.task_id,
      ]);

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'e2' },
        { provider, pgVector },
      );

      const all = await pgVector.query({
        indexName: PLANNER_VECTOR_INDEX,
        filter: { tenant_id: { $eq: seeded.tenant_id }, task_id: { $eq: seeded.task_id } },
        topK: 10,
      });
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe(taskVectorId(seeded.tenant_id, seeded.task_id));
    });
  });
});
