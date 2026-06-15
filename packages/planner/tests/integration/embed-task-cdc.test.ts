import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import {
  PLANNER_VECTOR_INDEX,
  PLANNER_VECTOR_NAMESPACE,
  type TaskVectorMetadata,
} from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { embedTask } from '../../src/backend/embeddings/embed-task.ts';
import { handleTaskCreated } from '../../src/backend/subscribers/task-embedding.ts';
import { seedTaskForTest } from '../helpers/seed.ts';

const pgDialect = new PgDialect();

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

function makeTaskCreatedEvent(opts: { tenantId: string; taskId: string; eventId: string }) {
  return {
    id: opts.eventId,
    occurredAt: new Date(),
    tenantId: opts.tenantId,
    aggregateType: 'planner.task' as const,
    aggregateId: opts.taskId,
    eventType: 'planner.task.created' as const,
    eventVersion: 1 as const,
    payload: {
      actor: { type: 'user' as const, user_id: '00000000-0000-0000-0000-000000000001' },
      group_id: '00000000-0000-0000-0000-000000000002',
      after: {
        task_id: opts.taskId,
        plan_id: '00000000-0000-0000-0000-000000000003',
        group_id: '00000000-0000-0000-0000-000000000002',
        bucket_id: null,
        title: 'E2E test task',
        description: 'Created via CDC subscriber test',
        priority_number: 1 as const,
        percent_complete: 0,
        is_deferred: false,
        preview_type: 'automatic' as const,
        start_at: null,
        due_at: null,
        order_hint: null,
        assignee_priority: null,
        review_state: null,
        external_source: 'native' as const,
        external_id: null,
        created_by: '00000000-0000-0000-0000-000000000001',
      },
    },
  };
}

function makeSyncEmbedCtx(opts: { pgVector: PgVector; provider: FakeEmbeddingProvider }) {
  const { pgVector, provider } = opts;

  return {
    tx: {
      async execute(sqlTemplate: Parameters<typeof pgDialect.sqlToQuery>[0]) {
        const { sql: sqlText, params } = pgDialect.sqlToQuery(sqlTemplate);

        if (!sqlText.includes('graphile_worker.add_job')) {
          return { rows: [] };
        }

        const rawPayload = params[1];
        const jobPayload =
          typeof rawPayload === 'string'
            ? (JSON.parse(rawPayload) as { tenant_id: string; task_id: string; event_id: string })
            : (rawPayload as { tenant_id: string; task_id: string; event_id: string });

        await embedTask(jobPayload, { provider, pgVector });
        return { rows: [] };
      },
    },
  };
}

describe('CDC end-to-end: planner.task.created → Mastra vector store row', () => {
  it('handleTaskCreated produces a vector row for a seeded task', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const seeded = await seedTaskForTest(pool, {
        title: 'E2E test task',
        description: 'Created via CDC subscriber test',
        labels: ['testing'],
      });

      const eventId = crypto.randomUUID();
      const event = makeTaskCreatedEvent({
        tenantId: seeded.tenant_id,
        taskId: seeded.task_id,
        eventId,
      });

      const ctx = makeSyncEmbedCtx({ pgVector, provider });
      await handleTaskCreated(event as never, ctx as never);

      const rows = await pgVector.query({
        indexName: PLANNER_VECTOR_INDEX,
        filter: {
          tenant_id: { $eq: seeded.tenant_id },
          task_id: { $eq: seeded.task_id },
        },
        topK: 1,
      });
      expect(rows).toHaveLength(1);
      const meta = rows[0]!.metadata as TaskVectorMetadata;
      expect(meta.plan_id).toBe(seeded.plan_id);
    });
  });
});
