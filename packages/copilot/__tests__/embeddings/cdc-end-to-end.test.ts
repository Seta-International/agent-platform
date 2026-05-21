/**
 * End-to-end CDC integration test.
 *
 * Strategy:
 *  1. Seed a task in the DB.
 *  2. Build a planner.task.created DomainEvent for that task.
 *  3. Invoke the refreshTaskCreatedSubscriber handler with a fake ctx whose
 *     tx.execute intercepts the graphile_worker.add_job call, extracts the
 *     embed_task payload, and immediately runs embedTask synchronously.
 *  4. Assert that planner.task_embeddings has a row for the task.
 *
 * This verifies the full CDC→embedding pipeline intent without wiring a real
 * graphile-worker queue (which would require a separate worker process).
 */
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { seedTaskForTest } from '../../../planner/tests/helpers/seed.ts';
import { embedTask } from '../../src/backend/embeddings/embed-task.ts';
import { refreshTaskCreatedSubscriber } from '../../src/backend/embeddings/subscribers/refresh-task.ts';

const pgDialect = new PgDialect();

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

/**
 * Build a minimal DomainEvent<PlannerTaskCreated.payload> for the subscriber.
 */
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
        skill_tags: ['testing'],
        review_state: null,
        external_source: 'native' as const,
        external_id: null,
        created_by: '00000000-0000-0000-0000-000000000001',
      },
    },
  };
}

/**
 * Build a fake ctx.tx that intercepts graphile_worker.add_job calls.
 *
 * Instead of inserting into the worker queue, it uses drizzle's public
 * `PgDialect.sqlToQuery()` to materialise the SQL and positional params from
 * the drizzle SQL template object, then extracts the embed_task payload from
 * params[1] (the second positional arg in the add_job call, after the job name).
 *
 * sqlToQuery() returns { sql: string, params: unknown[] } where params are the
 * interpolated values in template order. For the refresh-task subscriber the
 * order is: ['embed_task', payloadJson, 10, jobKey, 'replace'].
 */
function makeSyncEmbedCtx(opts: { pool: import('pg').Pool; provider: FakeEmbeddingProvider }) {
  const { pool, provider } = opts;

  return {
    tx: {
      async execute(sqlTemplate: Parameters<typeof pgDialect.sqlToQuery>[0]) {
        const { sql: sqlText, params } = pgDialect.sqlToQuery(sqlTemplate);

        if (!sqlText.includes('graphile_worker.add_job')) {
          // Not an embed_task add_job call — ignore.
          return { rows: [] };
        }

        // params[1] is the payload JSON string (second positional arg after the job name).
        const rawPayload = params[1];
        const jobPayload =
          typeof rawPayload === 'string'
            ? (JSON.parse(rawPayload) as { tenant_id: string; task_id: string; event_id: string })
            : (rawPayload as { tenant_id: string; task_id: string; event_id: string });

        await embedTask(jobPayload, { pool, provider });
        return { rows: [] };
      },
    },
  };
}

describe('CDC end-to-end: planner.task.created → task_embeddings row', () => {
  it('subscriber handler produces an embedding row for a seeded task', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      // 1. Seed a real task in the DB.
      const seeded = await seedTaskForTest(pool, {
        title: 'E2E test task',
        description: 'Created via CDC subscriber test',
        skill_tags: ['testing'],
      });

      // 2. Build the CDC event.
      const eventId = crypto.randomUUID();
      const event = makeTaskCreatedEvent({
        tenantId: seeded.tenant_id,
        taskId: seeded.task_id,
        eventId,
      });

      // 3. Invoke subscriber with a ctx that immediately embeds on add_job.
      const ctx = makeSyncEmbedCtx({ pool, provider });
      await refreshTaskCreatedSubscriber.handler(event as never, ctx as never);

      // 4. Assert the embedding row exists.
      const { rows } = await pool.query(
        `SELECT chunk_ordinal FROM planner.task_embeddings
          WHERE tenant_id = $1 AND task_id = $2
          ORDER BY chunk_ordinal`,
        [seeded.tenant_id, seeded.task_id],
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect((rows[0] as { chunk_ordinal: number }).chunk_ordinal).toBe(0);
    });
  });
});
