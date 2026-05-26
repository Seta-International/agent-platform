import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import { IDENTITY_VECTOR_INDEX, IDENTITY_VECTOR_NAMESPACE } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { embedUserProfile } from '../../../src/backend/embeddings/embed-user-profile.ts';
import { refreshUserProfileUpdatedSubscriber } from '../../../src/backend/embeddings/subscribers/refresh-user-profile.ts';
import { seedUserWithSkillsForTest } from '../../helpers/seed-user.ts';

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
        id: 'identity-user-profile-embeddings-test',
        connectionString: databaseUrl,
        schemaName: IDENTITY_VECTOR_NAMESPACE,
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
            ? (JSON.parse(rawPayload) as { tenant_id: string; user_id: string; event_id: string })
            : (rawPayload as { tenant_id: string; user_id: string; event_id: string });

        await embedUserProfile(jobPayload, { provider, pgVector });
        return { rows: [] };
      },
    },
  };
}

describe('CDC end-to-end: identity.user.profile.updated → user_profile vector row', () => {
  it('subscriber handler produces an embedding row for a user with skills', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const seeded = await seedUserWithSkillsForTest(pool, {
        skills: ['typescript', 'postgres'],
      });

      const eventId = crypto.randomUUID();
      const event = makeProfileUpdatedEvent({
        tenantId: seeded.tenant_id,
        userId: seeded.user_id,
        eventId,
      });

      const ctx = makeSyncEmbedCtx({ pgVector, provider });
      await refreshUserProfileUpdatedSubscriber.handler(event as never, ctx as never);

      const rows = await pgVector.query({
        indexName: IDENTITY_VECTOR_INDEX,
        filter: {
          tenant_id: { $eq: seeded.tenant_id },
          user_id: { $eq: seeded.user_id },
        },
        topK: 1,
      });
      expect(rows).toHaveLength(1);
    });
  });
});
