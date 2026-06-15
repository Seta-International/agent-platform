import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import {
  ensurePlannerVectorIndex,
  PLANNER_VECTOR_INDEX,
  PLANNER_VECTOR_NAMESPACE,
  type TaskVectorMetadata,
  taskVectorId,
} from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import { withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BatchInputRow,
  type BatchResultRow,
  backfillTasks,
} from '../../../src/backend/embeddings/backfill.ts';
import { buildTaskSource } from '../../../src/backend/embeddings/source.ts';
import { seedTaskForTest } from '../../helpers/seed.ts';

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

async function listVectors(pgVector: PgVector, tenantId: string): Promise<TaskVectorMetadata[]> {
  const rows = await pgVector.query({
    indexName: PLANNER_VECTOR_INDEX,
    filter: { tenant_id: { $eq: tenantId } },
    topK: 1000,
  });
  return rows
    .map((r) => r.metadata as TaskVectorMetadata | undefined)
    .filter((m): m is TaskVectorMetadata => m != null)
    .sort((a, b) => a.task_id.localeCompare(b.task_id));
}

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
      vector: new Array<number>(dimensions).fill(1 / Math.sqrt(dimensions)),
    }));
  };

  return { submitBatch, pollUntilDone, submittedInputs };
}

describe('backfillTasks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('embeds non-deleted tasks via batch path (soft-deleted excluded)', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const { submitBatch, pollUntilDone } = makeFakeBatch(1536);

      const t1 = await seedTaskForTest(pool, {
        title: 'Task one',
        description: 'First live task',
        labels: ['ts'],
      });
      const t2 = await seedTaskForTest(pool, {
        tenant_id: t1.tenant_id,
        title: 'Task two',
        description: 'Second live task',
        labels: ['go'],
      });
      await seedTaskForTest(pool, {
        tenant_id: t1.tenant_id,
        title: 'Deleted task',
        description: 'Should not be embedded',
        soft_deleted: true,
      });

      await backfillTasks({
        tenant_id: t1.tenant_id,
        pool,
        pgVector,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      const metas = await listVectors(pgVector, t1.tenant_id);
      expect(metas).toHaveLength(2);

      const planByTask = new Map([
        [t1.task_id, t1.plan_id],
        [t2.task_id, t2.plan_id],
      ]);

      for (const meta of metas) {
        expect(planByTask.get(meta.task_id)).toBe(meta.plan_id);

        const isT1 = meta.task_id === t1.task_id;
        const expectedSource = buildTaskSource(
          isT1
            ? { title: 'Task one', description: 'First live task', labels: ['ts'] }
            : { title: 'Task two', description: 'Second live task', labels: ['go'] },
        );
        expect(meta.chunk_text).toBe(expectedSource);
        expect(meta.source_hash).toBe(sourceHash(expectedSource));
      }
    });
  });

  it('hash gate: skips already-current rows, only submits stale ones', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const { submitBatch, pollUntilDone, submittedInputs } = makeFakeBatch(1536);

      const t1 = await seedTaskForTest(pool, {
        title: 'Already embedded',
        description: 'This one is current',
        labels: ['ts'],
      });
      const t2 = await seedTaskForTest(pool, {
        tenant_id: t1.tenant_id,
        title: 'Needs embedding',
        description: 'This one is new',
      });

      const source1 = buildTaskSource({
        title: 'Already embedded',
        description: 'This one is current',
        labels: ['ts'],
      });
      const hash1 = sourceHash(source1);

      await ensurePlannerVectorIndex(pgVector);
      const fakeVec = new Array<number>(1536).fill(1 / Math.sqrt(1536));
      await pgVector.upsert({
        indexName: PLANNER_VECTOR_INDEX,
        vectors: [fakeVec],
        metadata: [
          {
            tenant_id: t1.tenant_id,
            task_id: t1.task_id,
            plan_id: t1.plan_id,
            chunk_text: source1,
            source_hash: hash1,
            model_id: 'openai:text-embedding-3-small',
            embedded_at: new Date().toISOString(),
          } satisfies TaskVectorMetadata,
        ],
        ids: [taskVectorId(t1.tenant_id, t1.task_id)],
      });

      await backfillTasks({
        tenant_id: t1.tenant_id,
        pool,
        pgVector,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      expect(submittedInputs.length).toBeGreaterThan(0);
      const allSubmittedIds = submittedInputs.flat().map((r) => r.custom_id);
      expect(allSubmittedIds).toContain(t2.task_id);
      expect(allSubmittedIds).not.toContain(t1.task_id);
    });
  });

  it('backfill skips tasks whose source exceeds MAX_SOURCE_TOKENS', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const { submitBatch, pollUntilDone, submittedInputs } = makeFakeBatch(1536);

      const shortTask = await seedTaskForTest(pool, {
        title: 'short',
        description: 'fits',
      });
      const longTask = await seedTaskForTest(pool, {
        tenant_id: shortTask.tenant_id,
        title: 'long',
        description: Array.from({ length: 1100 }, () => 'word').join(' '),
      });

      await backfillTasks({
        tenant_id: shortTask.tenant_id,
        pool,
        pgVector,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      const metas = await listVectors(pgVector, shortTask.tenant_id);
      expect(metas.map((m) => m.task_id)).toEqual([shortTask.task_id]);

      const submittedIds = submittedInputs.flat().map((r) => r.custom_id);
      expect(submittedIds).toContain(shortTask.task_id);
      expect(submittedIds).not.toContain(longTask.task_id);
    });
  });

  it('empty tenant: returns without calling submitBatch', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const { submitBatch, pollUntilDone, submittedInputs } = makeFakeBatch(1536);

      const seeded = await seedTaskForTest(pool, {
        title: 'Only task',
        description: null,
        soft_deleted: true,
      });

      await backfillTasks({
        tenant_id: seeded.tenant_id,
        pool,
        pgVector,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      expect(submittedInputs).toHaveLength(0);
    });
  });
});
