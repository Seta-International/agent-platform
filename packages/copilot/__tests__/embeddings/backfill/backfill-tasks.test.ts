import { resetCoreDb } from '@seta/core/internal/test-support';
import { buildTaskSource } from '@seta/planner';
import { closePools, ensureTenantPartition, initPools } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import { withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedTaskForTest } from '../../../../planner/tests/helpers/seed.ts';
import {
  type BatchInputRow,
  type BatchResultRow,
  backfillTasks,
} from '../../../src/backend/embeddings/backfill/backfill-tasks.ts';

// ---------------------------------------------------------------------------
// Test DB wrapper
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Fake batch helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake submitBatch that stores submitted inputs and returns deterministic
 * all-zero vectors when polled.
 */
function makeFakeBatch(dimensions = 1536): {
  submitBatch: (
    opts: { apiKey: string; model: string },
    inputs: BatchInputRow[],
  ) => Promise<string>;
  pollUntilDone: (opts: { apiKey: string }, batchId: string) => Promise<BatchResultRow[]>;
  submittedInputs: BatchInputRow[][];
} {
  const submittedInputs: BatchInputRow[][] = [];
  const pending = new Map<string, BatchInputRow[]>();
  let seq = 0;

  const submitBatch = async (
    _opts: { apiKey: string; model: string },
    inputs: BatchInputRow[],
  ): Promise<string> => {
    const id = `batch-${++seq}`;
    submittedInputs.push(inputs);
    pending.set(id, inputs);
    return id;
  };

  const pollUntilDone = async (
    _opts: { apiKey: string },
    batchId: string,
  ): Promise<BatchResultRow[]> => {
    const inputs = pending.get(batchId) ?? [];
    return inputs.map((row) => ({
      custom_id: row.custom_id,
      vector: new Array<number>(dimensions).fill(0),
    }));
  };

  return { submitBatch, pollUntilDone, submittedInputs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('backfillTasks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('embeds non-deleted tasks via batch path (soft-deleted excluded)', async () => {
    await withDb(async ({ pool }) => {
      const { submitBatch, pollUntilDone } = makeFakeBatch(1536);

      // Seed 2 live tasks + 1 soft-deleted in the same tenant.
      const t1 = await seedTaskForTest(pool, {
        title: 'Task one',
        description: 'First live task',
        skill_tags: ['ts'],
      });
      const t2 = await seedTaskForTest(pool, {
        tenant_id: t1.tenant_id,
        title: 'Task two',
        description: 'Second live task',
        skill_tags: ['go'],
      });
      await seedTaskForTest(pool, {
        tenant_id: t1.tenant_id,
        title: 'Deleted task',
        description: 'Should not be embedded',
        skill_tags: [],
        soft_deleted: true,
      });

      await backfillTasks({
        tenant_id: t1.tenant_id,
        pool,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      const rows = await pool.query<{
        task_id: string;
        chunk_ordinal: number;
        chunk_text: string;
        source_hash: string;
      }>(
        `SELECT task_id, chunk_ordinal, chunk_text, source_hash
           FROM planner.task_embeddings
          WHERE tenant_id = $1
          ORDER BY task_id, chunk_ordinal`,
        [t1.tenant_id],
      );

      expect(rows.rows).toHaveLength(2);

      const taskIds = rows.rows.map((r) => r.task_id);
      expect(taskIds).toContain(t1.task_id);
      expect(taskIds).toContain(t2.task_id);

      for (const row of rows.rows) {
        expect(row.chunk_ordinal).toBe(0);

        const isT1 = row.task_id === t1.task_id;
        const expectedSource = buildTaskSource(
          isT1
            ? { title: 'Task one', description: 'First live task', skill_tags: ['ts'] }
            : { title: 'Task two', description: 'Second live task', skill_tags: ['go'] },
        );
        expect(row.chunk_text).toBe(expectedSource);
        expect(row.source_hash).toBe(sourceHash(expectedSource));
      }
    });
  });

  it('hash gate: skips already-current rows, only submits stale ones', async () => {
    await withDb(async ({ pool }) => {
      const { submitBatch, pollUntilDone, submittedInputs } = makeFakeBatch(1536);

      const t1 = await seedTaskForTest(pool, {
        title: 'Already embedded',
        description: 'This one is current',
        skill_tags: ['ts'],
      });
      const t2 = await seedTaskForTest(pool, {
        tenant_id: t1.tenant_id,
        title: 'Needs embedding',
        description: 'This one is new',
        skill_tags: [],
      });

      // Pre-populate the embedding for t1 with the correct hash.
      const source1 = buildTaskSource({
        title: 'Already embedded',
        description: 'This one is current',
        skill_tags: ['ts'],
      });
      const hash1 = sourceHash(source1);

      // Ensure partition exists before inserting directly.
      await ensureTenantPartition(pool, {
        parent: 'planner.task_embeddings',
        embeddingColumn: 'embedding',
        tenantId: t1.tenant_id,
        opclass: 'halfvec_cosine_ops',
        hnsw: { m: 16, efConstruction: 200 },
      });

      const fakeVec = new Array<number>(1536).fill(0);
      await pool.query(
        `INSERT INTO planner.task_embeddings
           (tenant_id, task_id, chunk_ordinal, chunk_text, source_hash, embedding, model_id, embedded_at)
         VALUES ($1, $2, 0, $3, $4, $5::halfvec, $6, now())
         ON CONFLICT DO NOTHING`,
        [
          t1.tenant_id,
          t1.task_id,
          source1,
          hash1,
          `[${fakeVec.join(',')}]`,
          'openai:text-embedding-3-small',
        ],
      );

      await backfillTasks({
        tenant_id: t1.tenant_id,
        pool,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      // submitBatch must have been called, but only with t2 (t1 was hash-gated).
      expect(submittedInputs.length).toBeGreaterThan(0);
      const allSubmittedIds = submittedInputs.flat().map((r) => r.custom_id);
      expect(allSubmittedIds).toContain(t2.task_id);
      expect(allSubmittedIds).not.toContain(t1.task_id);
    });
  });

  it('empty tenant: returns without calling submitBatch', async () => {
    await withDb(async ({ pool }) => {
      const { submitBatch, pollUntilDone, submittedInputs } = makeFakeBatch(1536);

      // Use a soft-deleted task to get a valid tenant_id with zero live tasks.
      const seeded = await seedTaskForTest(pool, {
        title: 'Only task',
        description: null,
        skill_tags: [],
        soft_deleted: true,
      });

      await backfillTasks({
        tenant_id: seeded.tenant_id,
        pool,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      expect(submittedInputs).toHaveLength(0);
    });
  });
});
