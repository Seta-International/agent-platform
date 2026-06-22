import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person, personSkill } from '../../src/backend/db/schema.ts';
import { addPersonSkill, removePersonSkill } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('addPersonSkill / removePersonSkill', () => {
  it('inserts a skill row with resolved skill_name and emits people.person.skill.added', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        // Seed a core.skill_category and core.skill
        const catId = crypto.randomUUID();
        const skillId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO core.skill_category (id, tenant_id, name) VALUES ($1,$2,$3)`,
          [catId, t.tenant_id, 'Engineering'],
        );
        await pool.query(
          `INSERT INTO core.skill (id, tenant_id, category_id, name) VALUES ($1,$2,$3,$4)`,
          [skillId, t.tenant_id, catId, 'TypeScript'],
        );

        // Seed a person row
        const [p] = await peopleDb().insert(person).values({ tenant_id: t.tenant_id }).returning();
        const personId = p!.id;

        await addPersonSkill({ person_id: personId, skill_id: skillId, session: t.adminSession });

        const rows = await peopleDb()
          .select()
          .from(personSkill)
          .where(
            and(
              eq(personSkill.tenant_id, t.tenant_id),
              eq(personSkill.person_id, personId),
              eq(personSkill.skill_id, skillId),
            ),
          );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.skill_name).toBe('TypeScript');

        const events = await readEvents(pool, t.tenant_id, 'people.person.skill.added');
        expect(events).toHaveLength(1);
        expect(events[0]?.aggregate_id).toBe(personId);
        expect(events[0]?.payload).toMatchObject({ person_id: personId, skill_id: skillId });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('addPersonSkill is idempotent (duplicate does not throw, still one row)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const catId = crypto.randomUUID();
        const skillId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO core.skill_category (id, tenant_id, name) VALUES ($1,$2,$3)`,
          [catId, t.tenant_id, 'Engineering'],
        );
        await pool.query(
          `INSERT INTO core.skill (id, tenant_id, category_id, name) VALUES ($1,$2,$3,$4)`,
          [skillId, t.tenant_id, catId, 'React'],
        );

        const [p] = await peopleDb().insert(person).values({ tenant_id: t.tenant_id }).returning();
        const personId = p!.id;

        await addPersonSkill({ person_id: personId, skill_id: skillId, session: t.adminSession });
        await addPersonSkill({ person_id: personId, skill_id: skillId, session: t.adminSession });

        const rows = await peopleDb()
          .select()
          .from(personSkill)
          .where(
            and(
              eq(personSkill.tenant_id, t.tenant_id),
              eq(personSkill.person_id, personId),
              eq(personSkill.skill_id, skillId),
            ),
          );
        expect(rows).toHaveLength(1);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('removePersonSkill deletes the row and emits people.person.skill.removed', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const catId = crypto.randomUUID();
        const skillId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO core.skill_category (id, tenant_id, name) VALUES ($1,$2,$3)`,
          [catId, t.tenant_id, 'Engineering'],
        );
        await pool.query(
          `INSERT INTO core.skill (id, tenant_id, category_id, name) VALUES ($1,$2,$3,$4)`,
          [skillId, t.tenant_id, catId, 'Go'],
        );

        const [p] = await peopleDb().insert(person).values({ tenant_id: t.tenant_id }).returning();
        const personId = p!.id;

        await addPersonSkill({ person_id: personId, skill_id: skillId, session: t.adminSession });
        await removePersonSkill({
          person_id: personId,
          skill_id: skillId,
          session: t.adminSession,
        });

        const rows = await peopleDb()
          .select()
          .from(personSkill)
          .where(
            and(
              eq(personSkill.tenant_id, t.tenant_id),
              eq(personSkill.person_id, personId),
              eq(personSkill.skill_id, skillId),
            ),
          );
        expect(rows).toHaveLength(0);

        const events = await readEvents(pool, t.tenant_id, 'people.person.skill.removed');
        expect(events).toHaveLength(1);
        expect(events[0]?.aggregate_id).toBe(personId);
        expect(events[0]?.payload).toMatchObject({ person_id: personId, skill_id: skillId });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws VALIDATION for unknown skill_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const [p] = await peopleDb().insert(person).values({ tenant_id: t.tenant_id }).returning();
        const personId = p!.id;

        await expect(
          addPersonSkill({
            person_id: personId,
            skill_id: crypto.randomUUID(),
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
