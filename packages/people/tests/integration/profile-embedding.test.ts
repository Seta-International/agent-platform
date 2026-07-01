/**
 * Integration tests for the People profile-embedding pipeline.
 *
 * Embed tests use FakeEmbeddingProvider — no live external API call.
 * Subscriber tests use a fake ctx.tx.execute spy — no DB required.
 */
import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person, personSkill } from '../../src/backend/db/schema.ts';
import { embedPersonProfile } from '../../src/backend/embeddings/embed-profile.ts';
import { buildPersonProfileSource } from '../../src/backend/embeddings/source.ts';
import {
  refreshPersonSkillAddedSubscriber,
  refreshPersonSkillRemovedSubscriber,
} from '../../src/backend/embeddings/subscribers/refresh-profile.ts';
import {
  PEOPLE_VECTOR_INDEX,
  PEOPLE_VECTOR_NAMESPACE,
  type PersonProfileVectorMetadata,
  personProfileVectorId,
} from '../../src/backend/embeddings/vector-store.ts';

// ── DB helper ────────────────────────────────────────────────────────────────

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function withDb<T>(
  fn: (ctx: { pool: import('pg').Pool; pgVector: PgVector }) => Promise<T>,
): Promise<T> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    initPools({ databaseUrl });
    const pgVector = new PgVector({
      id: 'people-person-profile-embeddings-test',
      connectionString: databaseUrl,
      schemaName: PEOPLE_VECTOR_NAMESPACE,
    });
    try {
      return await fn({ pool, pgVector });
    } finally {
      await pgVector.disconnect().catch(() => {});
      resetPeopleDb();
      resetCoreDb();
      await closePools();
    }
  });
}

// ── Seed helper ──────────────────────────────────────────────────────────────

async function seedPerson(
  pool: import('pg').Pool,
  tenantId: string,
): Promise<{ person_id: string }> {
  const [p] = await peopleDb().insert(person).values({ tenant_id: tenantId }).returning();
  return { person_id: p!.id };
}

async function seedTenantOnly(pool: import('pg').Pool): Promise<{ tenant_id: string }> {
  const tenant_id = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenant_id,
    'Embed Test Org',
    `emb-${tenant_id.slice(0, 8)}`,
  ]);
  return { tenant_id };
}

async function addSkill(
  pool: import('pg').Pool,
  tenantId: string,
  personId: string,
  skillName: string,
): Promise<void> {
  const skillId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO people.person_skill (id, tenant_id, person_id, skill_id, skill_name)
     VALUES ($1,$2,$3,$4,$5)`,
    [crypto.randomUUID(), tenantId, personId, skillId, skillName],
  );
}

async function fetchMeta(
  pgVector: PgVector,
  tenantId: string,
  personId: string,
): Promise<PersonProfileVectorMetadata | undefined> {
  try {
    const rows = await pgVector.query({
      indexName: PEOPLE_VECTOR_INDEX,
      filter: { tenant_id: { $eq: tenantId }, person_id: { $eq: personId } },
      topK: 1,
    });
    return rows[0]?.metadata as PersonProfileVectorMetadata | undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('does not exist')) return undefined;
    throw err;
  }
}

// ── Embed integration tests ──────────────────────────────────────────────────

describe('embedPersonProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('upserts a vector row keyed by person_id', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id } = await seedTenantOnly(pool);
      const { person_id } = await seedPerson(pool, tenant_id);

      await addSkill(pool, tenant_id, person_id, 'typescript');
      await addSkill(pool, tenant_id, person_id, 'postgres');

      await embedPersonProfile({ tenant_id, person_id, event_id: 'e1' }, { provider, pgVector });

      const meta = await fetchMeta(pgVector, tenant_id, person_id);
      expect(meta).toBeDefined();
      expect(meta!.person_id).toBe(person_id);
      expect(meta!.tenant_id).toBe(tenant_id);
      expect(meta!.source_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(meta!.model_id).toBe(provider.modelId);
    });
  });

  it('source text contains the skill names', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id } = await seedTenantOnly(pool);
      const { person_id } = await seedPerson(pool, tenant_id);

      await addSkill(pool, tenant_id, person_id, 'golang');
      await addSkill(pool, tenant_id, person_id, 'kubernetes');

      await embedPersonProfile({ tenant_id, person_id, event_id: 'e2' }, { provider, pgVector });

      const meta = await fetchMeta(pgVector, tenant_id, person_id);
      const expectedSource = buildPersonProfileSource({ skills: ['golang', 'kubernetes'] });
      expect(meta!.source_hash).toBe(sourceHash(expectedSource));
      expect(meta!.skills).toEqual(['golang', 'kubernetes']);
    });
  });

  it('hash gate: embed is called only once for identical consecutive calls', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const embedSpy = vi.spyOn(provider, 'embed');
      const { tenant_id } = await seedTenantOnly(pool);
      const { person_id } = await seedPerson(pool, tenant_id);

      await addSkill(pool, tenant_id, person_id, 'rust');

      const payload = { tenant_id, person_id, event_id: 'e3' };
      const deps = { provider, pgVector };

      await embedPersonProfile(payload, deps);
      await embedPersonProfile(payload, deps);

      expect(embedSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('deletes the row when person has no skills', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id } = await seedTenantOnly(pool);
      const { person_id } = await seedPerson(pool, tenant_id);

      await addSkill(pool, tenant_id, person_id, 'java');
      await embedPersonProfile({ tenant_id, person_id, event_id: 'e4a' }, { provider, pgVector });
      expect(await fetchMeta(pgVector, tenant_id, person_id)).toBeDefined();

      // Remove the skill row
      await pool.query(`DELETE FROM people.person_skill WHERE person_id = $1`, [person_id]);

      await embedPersonProfile({ tenant_id, person_id, event_id: 'e4b' }, { provider, pgVector });
      expect(await fetchMeta(pgVector, tenant_id, person_id)).toBeUndefined();
    });
  });

  it('vector_id is deterministic: upsert replaces prior row for same (tenant, person)', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id } = await seedTenantOnly(pool);
      const { person_id } = await seedPerson(pool, tenant_id);

      await addSkill(pool, tenant_id, person_id, 'initial-skill');
      await embedPersonProfile({ tenant_id, person_id, event_id: 'e5a' }, { provider, pgVector });

      await pool.query(`DELETE FROM people.person_skill WHERE person_id = $1`, [person_id]);
      await addSkill(pool, tenant_id, person_id, 'revised-skill');
      await embedPersonProfile({ tenant_id, person_id, event_id: 'e5b' }, { provider, pgVector });

      const all = await pgVector.query({
        indexName: PEOPLE_VECTOR_INDEX,
        filter: { tenant_id: { $eq: tenant_id }, person_id: { $eq: person_id } },
        topK: 10,
      });
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe(personProfileVectorId(tenant_id, person_id));
    });
  });
});

// ── Subscriber unit tests (no DB) ────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PERSON_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const SKILL_ID = 'cccccccc-0000-0000-0000-000000000003';
const EVENT_ID = 'dddddddd-0000-0000-0000-000000000004';

function makeFakeCtx() {
  const executeSpy = vi.fn().mockResolvedValue({ rows: [] });
  return { ctx: { tx: { execute: executeSpy } }, executeSpy };
}

function makeSkillAddedEvent() {
  return {
    id: EVENT_ID,
    occurredAt: new Date(),
    tenantId: TENANT_ID,
    aggregateType: 'people.person' as const,
    aggregateId: PERSON_ID,
    eventType: 'people.person.skill.added' as const,
    eventVersion: 1 as const,
    payload: { person_id: PERSON_ID, skill_id: SKILL_ID, tenant_id: TENANT_ID },
  };
}

function makeSkillRemovedEvent() {
  return {
    id: EVENT_ID,
    occurredAt: new Date(),
    tenantId: TENANT_ID,
    aggregateType: 'people.person' as const,
    aggregateId: PERSON_ID,
    eventType: 'people.person.skill.removed' as const,
    eventVersion: 1 as const,
    payload: { person_id: PERSON_ID, skill_id: SKILL_ID, tenant_id: TENANT_ID },
  };
}

describe('refreshPersonSkillAddedSubscriber', () => {
  it('event type and subscription are set', () => {
    expect(refreshPersonSkillAddedSubscriber.event).toBe('people.person.skill.added');
    expect(refreshPersonSkillAddedSubscriber.eventVersion).toBe(1);
    expect(typeof refreshPersonSkillAddedSubscriber.subscription).toBe('string');
  });

  it('enqueues embed_person_profile with jobKey + replace + maxAttempts 10', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshPersonSkillAddedSubscriber.handler(makeSkillAddedEvent() as never, ctx as never);

    expect(executeSpy).toHaveBeenCalledOnce();
    const serialised = JSON.stringify(executeSpy.mock.calls[0]![0]);
    expect(serialised).toContain('embed_person_profile');
    expect(serialised).toContain(`embed_person_profile:${TENANT_ID}:${PERSON_ID}`);
    expect(serialised).toContain('replace');
    expect(serialised).toContain('10');
  });

  it('passes tenant_id + person_id + event_id in payload', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshPersonSkillAddedSubscriber.handler(makeSkillAddedEvent() as never, ctx as never);

    const serialised = JSON.stringify(executeSpy.mock.calls[0]![0]);
    expect(serialised).toContain(TENANT_ID);
    expect(serialised).toContain(PERSON_ID);
    expect(serialised).toContain(EVENT_ID);
  });
});

describe('refreshPersonSkillRemovedSubscriber', () => {
  it('event type and subscription are set', () => {
    expect(refreshPersonSkillRemovedSubscriber.event).toBe('people.person.skill.removed');
    expect(refreshPersonSkillRemovedSubscriber.eventVersion).toBe(1);
    expect(typeof refreshPersonSkillRemovedSubscriber.subscription).toBe('string');
  });

  it('enqueues embed_person_profile on skill removed', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshPersonSkillRemovedSubscriber.handler(
      makeSkillRemovedEvent() as never,
      ctx as never,
    );

    expect(executeSpy).toHaveBeenCalledOnce();
    const serialised = JSON.stringify(executeSpy.mock.calls[0]![0]);
    expect(serialised).toContain('embed_person_profile');
    expect(serialised).toContain(`embed_person_profile:${TENANT_ID}:${PERSON_ID}`);
  });
});
