/**
 * End-to-end CDC integration test for the identity user-profile embedding pipeline.
 *
 * Strategy:
 *  1. Seed a user with skills in the DB.
 *  2. Build an identity.user.profile.updated DomainEvent that changes skills.
 *  3. Invoke the refreshUserProfileUpdatedSubscriber handler with a fake ctx whose
 *     tx.execute intercepts the graphile_worker.add_job call, extracts the
 *     embed_user_profile payload, and immediately runs embedUserProfile synchronously.
 *  4. Assert that identity.user_profile_embeddings has a row for the user.
 *
 * This verifies the full CDC→embedding pipeline intent without wiring a real
 * graphile-worker queue (which would require a separate worker process).
 */
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { embedUserProfile } from '../../src/backend/embeddings/embed-user-profile.ts';
import { refreshUserProfileUpdatedSubscriber } from '../../src/backend/embeddings/subscribers/refresh-user-profile.ts';
import { seedUserWithSkillsForTest } from '../helpers/seed-user.ts';

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
 * Build a minimal DomainEvent<UserProfileUpdatedPayload> that changes skills.
 * The refreshUserProfileUpdatedSubscriber only enqueues when skills appear in `after`.
 */
function makeProfileUpdatedEvent(opts: { tenantId: string; userId: string; eventId: string }) {
  return {
    id: opts.eventId,
    occurredAt: new Date(),
    tenantId: opts.tenantId,
    aggregateType: 'identity.user' as const,
    aggregateId: opts.userId,
    eventType: 'identity.user.profile.updated' as const,
    eventVersion: 1 as const,
    payload: {
      actor: { type: 'user' as const, user_id: opts.userId },
      user_id: opts.userId,
      before: { skills: [] },
      after: { skills: ['typescript', 'postgres'] },
    },
  };
}

/**
 * Build a fake ctx.tx that intercepts graphile_worker.add_job calls.
 *
 * Instead of inserting into the worker queue it materialises the SQL via
 * PgDialect.sqlToQuery(), extracts the embed_user_profile payload from
 * params[1], and immediately runs embedUserProfile synchronously.
 *
 * For the refresh-user-profile subscriber the positional params are:
 *   ['embed_user_profile', payloadJson, NULL, NULL, 10, jobKey, NULL, NULL, 'replace']
 */
function makeSyncEmbedCtx(opts: { pool: import('pg').Pool; provider: FakeEmbeddingProvider }) {
  const { pool, provider } = opts;

  return {
    tx: {
      async execute(sqlTemplate: Parameters<typeof pgDialect.sqlToQuery>[0]) {
        const { sql: sqlText, params } = pgDialect.sqlToQuery(sqlTemplate);

        if (!sqlText.includes('graphile_worker.add_job')) {
          return { rows: [] };
        }

        // params[1] is the payload JSON string (second positional arg after the job name).
        const rawPayload = params[1];
        const jobPayload =
          typeof rawPayload === 'string'
            ? (JSON.parse(rawPayload) as { tenant_id: string; user_id: string; event_id: string })
            : (rawPayload as { tenant_id: string; user_id: string; event_id: string });

        await embedUserProfile(jobPayload, { pool, provider });
        return { rows: [] };
      },
    },
  };
}

describe('CDC end-to-end: identity.user.profile.updated → user_profile_embeddings row', () => {
  it('subscriber handler produces an embedding row for a user with skills', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      // 1. Seed a real user with skills in the DB.
      const seeded = await seedUserWithSkillsForTest(pool, {
        skills: ['typescript', 'postgres'],
      });

      // 2. Build the CDC event.
      const eventId = crypto.randomUUID();
      const event = makeProfileUpdatedEvent({
        tenantId: seeded.tenant_id,
        userId: seeded.user_id,
        eventId,
      });

      // 3. Invoke subscriber with a ctx that immediately embeds on add_job.
      const ctx = makeSyncEmbedCtx({ pool, provider });
      await refreshUserProfileUpdatedSubscriber.handler(event as never, ctx as never);

      // 4. Assert the embedding row exists.
      const { rows } = await pool.query(
        `SELECT user_id, source_hash FROM identity.user_profile_embeddings
          WHERE tenant_id = $1 AND user_id = $2`,
        [seeded.tenant_id, seeded.user_id],
      );
      expect(rows).toHaveLength(1);
      expect((rows[0] as { user_id: string }).user_id).toBe(seeded.user_id);
    });
  });
});
