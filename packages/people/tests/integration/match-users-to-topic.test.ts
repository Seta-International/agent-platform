/**
 * Integration tests for People matchUsersToTopic (semantic user search).
 *
 * Uses FakeEmbeddingProvider (deterministic, no external API) — same stub
 * approach as the profile-embedding test. Embeds real person profiles via the
 * People embed pipeline, then searches and asserts ranking, threshold,
 * no-results, and worker-join display-field hydration.
 */
import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person, personSkill } from '../../src/backend/db/schema.ts';
import { matchUsersToTopic } from '../../src/backend/domain/match-users-to-topic.ts';
import { embedPersonProfile } from '../../src/backend/embeddings/embed-profile.ts';
import {
  PEOPLE_VECTOR_NAMESPACE,
  resetPeopleVectorStore,
} from '../../src/backend/embeddings/vector-store.ts';
import { linkUserToPerson } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function withDb<T>(
  fn: (c: {
    pool: import('pg').Pool;
    pgVector: PgVector;
    provider: FakeEmbeddingProvider;
  }) => Promise<T>,
): Promise<T> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    await resetPeopleVectorStore();
    initPools({ databaseUrl });
    const pgVector = new PgVector({
      id: 'people-match-users-to-topic-test',
      connectionString: databaseUrl,
      schemaName: PEOPLE_VECTOR_NAMESPACE,
    });
    try {
      return await fn({ pool, pgVector, provider: new FakeEmbeddingProvider() });
    } finally {
      await pgVector.disconnect().catch(() => {});
      await resetPeopleVectorStore();
      resetPeopleDb();
      resetCoreDb();
      await closePools();
    }
  });
}

async function seedTenant(pool: import('pg').Pool): Promise<string> {
  const tenant_id = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenant_id,
    'Match Test Org',
    `match-${tenant_id.slice(0, 8)}`,
  ]);
  return tenant_id;
}

/** Seed a worker (person + worker + skills) with a linked user account, then embed. */
async function seedWorkerAndEmbed(
  pgVector: PgVector,
  provider: FakeEmbeddingProvider,
  opts: {
    tenant_id: string;
    full_name: string;
    work_email: string;
    skills: string[];
    user_id?: string | null;
  },
): Promise<{ person_id: string; user_id: string | null }> {
  const user_id = opts.user_id === undefined ? crypto.randomUUID() : opts.user_id;
  const [p] = await peopleDb()
    .insert(person)
    .values({
      tenant_id: opts.tenant_id,
      full_name: opts.full_name,
      work_email: opts.work_email,
    })
    .returning();
  const person_id = p!.id;
  if (user_id !== null) await linkUserToPerson(opts.tenant_id, person_id, user_id);
  for (const skill of opts.skills) {
    await peopleDb().insert(personSkill).values({
      tenant_id: opts.tenant_id,
      person_id,
      skill_id: crypto.randomUUID(),
      skill_name: skill,
    });
  }
  await embedPersonProfile(
    { tenant_id: opts.tenant_id, person_id, event_id: crypto.randomUUID() },
    { provider, pgVector },
  );
  return { person_id, user_id };
}

describe('matchUsersToTopic (People)', () => {
  it('returns ranked hits for a matching topic and hydrates display fields from worker', async () => {
    await withDb(async ({ pool, pgVector, provider }) => {
      const tenant_id = await seedTenant(pool);
      const { user_id } = await seedWorkerAndEmbed(pgVector, provider, {
        tenant_id,
        full_name: 'Ada Lovelace',
        work_email: 'ada@example.test',
        skills: ['typescript', 'postgres'],
      });

      const hits = await matchUsersToTopic(
        { topic: 'typescript, postgres', tenant_id, limit: 10, minScore: 0 },
        { provider, pgVector },
      );

      expect(hits.length).toBeGreaterThanOrEqual(1);
      const top = hits[0]!;
      expect(top.rank).toBe(1);
      expect(top.item.user_id).toBe(user_id);
      // Display fields come from the worker join, not vector metadata.
      expect(top.item.display_name).toBe('Ada Lovelace');
      expect(top.item.email).toBe('ada@example.test');
      expect(top.item.skills).toEqual(['typescript', 'postgres']);
    });
  });

  it('respects the minScore threshold', async () => {
    await withDb(async ({ pool, pgVector, provider }) => {
      const tenant_id = await seedTenant(pool);
      await seedWorkerAndEmbed(pgVector, provider, {
        tenant_id,
        full_name: 'Grace Hopper',
        work_email: 'grace@example.test',
        skills: ['cobol'],
      });

      // An impossibly high threshold filters everything out.
      const none = await matchUsersToTopic(
        { topic: 'quantum chromodynamics', tenant_id, limit: 10, minScore: 0.999999 },
        { provider, pgVector },
      );
      expect(none).toEqual([]);

      // A permissive threshold returns the seeded worker.
      const some = await matchUsersToTopic(
        { topic: 'cobol', tenant_id, limit: 10, minScore: 0 },
        { provider, pgVector },
      );
      expect(some.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('returns empty array when no embeddings exist for the tenant', async () => {
    await withDb(async ({ pool, pgVector, provider }) => {
      const tenant_id = await seedTenant(pool);
      const hits = await matchUsersToTopic(
        { topic: 'anything', tenant_id, limit: 10, minScore: 0 },
        { provider, pgVector },
      );
      expect(hits).toEqual([]);
    });
  });

  it('drops hits whose person has no linked user account (cannot be assigned)', async () => {
    await withDb(async ({ pool, pgVector, provider }) => {
      const tenant_id = await seedTenant(pool);
      await seedWorkerAndEmbed(pgVector, provider, {
        tenant_id,
        full_name: 'No User Worker',
        work_email: 'nouser@example.test',
        skills: ['rust'],
        user_id: null,
      });

      const hits = await matchUsersToTopic(
        { topic: 'rust', tenant_id, limit: 10, minScore: 0 },
        { provider, pgVector },
      );
      expect(hits).toEqual([]);
    });
  });
});
