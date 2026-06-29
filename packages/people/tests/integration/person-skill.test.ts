import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person, personSkill } from '../../src/backend/db/schema.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('person_skill table', () => {
  it('inserts two skills and rejects a duplicate (tenant_id, person_id, skill_id)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        // Create a person row to satisfy the person_id FK
        const [p] = await peopleDb().insert(person).values({ tenant_id: t.tenant_id }).returning();
        const personId = p!.id;

        const skillId1 = crypto.randomUUID();
        const skillId2 = crypto.randomUUID();

        // Insert two distinct skills — both must succeed
        await peopleDb().insert(personSkill).values({
          tenant_id: t.tenant_id,
          person_id: personId,
          skill_id: skillId1,
          skill_name: 'TypeScript',
        });
        await peopleDb().insert(personSkill).values({
          tenant_id: t.tenant_id,
          person_id: personId,
          skill_id: skillId2,
          skill_name: 'React',
        });

        const rows = await peopleDb().select().from(personSkill);
        expect(rows.length).toBeGreaterThanOrEqual(2);

        // Duplicate (tenant_id, person_id, skill_id) must throw
        await expect(
          peopleDb().insert(personSkill).values({
            tenant_id: t.tenant_id,
            person_id: personId,
            skill_id: skillId1,
            skill_name: 'TypeScript duplicate',
          }),
        ).rejects.toThrow();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('person_skill_uniq index exists', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const r = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='people' AND indexname='person_skill_uniq'`,
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it('person_skill_by_person index exists', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const r = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='people' AND indexname='person_skill_by_person'`,
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it('person_skill_by_skill index exists', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const r = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='people' AND indexname='person_skill_by_skill'`,
      );
      expect(r.rowCount).toBe(1);
    });
  });
});
