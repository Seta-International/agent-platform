import { slugifySkill } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { buildSearchUsersBySkillExactSpec } from '../../src/backend/agent-tools/search-users-by-skill-exact.ts';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person } from '../../src/backend/db/schema.ts';
import { addPersonSkill } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedCatalogSkill(
  pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  tenantId: string,
  name: string,
): Promise<string> {
  const catId = crypto.randomUUID();
  const skillId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.skill_category (id, tenant_id, name) VALUES ($1,$2,$3)`, [
    catId,
    tenantId,
    `Category ${name}`,
  ]);
  await pool.query(
    `INSERT INTO core.skill (id, tenant_id, category_id, name, slug) VALUES ($1,$2,$3,$4,$5)`,
    [skillId, tenantId, catId, name, slugifySkill(name)],
  );
  return skillId;
}

async function seedSkillAlias(
  pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  tenantId: string,
  skillId: string,
  alias: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO core.skill_alias (id, tenant_id, skill_id, alias, slug) VALUES ($1,$2,$3,$4,$5)`,
    [crypto.randomUUID(), tenantId, skillId, alias, slugifySkill(alias)],
  );
}

describe('people_searchUsersBySkillExact', () => {
  it('matches skills case-insensitively and maps person → linked user', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const userId = crypto.randomUUID();

        const pythonId = await seedCatalogSkill(pool, t.tenant_id, 'Python');
        const javaId = await seedCatalogSkill(pool, t.tenant_id, 'Java');

        // Person linked to a user account, catalog casing "Python" / "Java".
        const [p] = await peopleDb()
          .insert(person)
          .values({ tenant_id: t.tenant_id, user_id: userId })
          .returning();
        const personId = p!.id;
        await addPersonSkill({ person_id: personId, skill_id: pythonId, session: t.adminSession });
        await addPersonSkill({ person_id: personId, skill_id: javaId, session: t.adminSession });

        const tool = buildSearchUsersBySkillExactSpec();
        // Task labels arrive lowercase — must still match "Python"/"Java".
        const out = await tool.execute({
          session: {
            tenant_id: t.tenant_id,
            user_id: t.adminSession.user_id,
            role_summary: t.adminSession.role_summary,
          },
          input: { labels: ['python', 'java'] },
        });

        expect(out.hits).toHaveLength(1);
        expect(out.hits[0]?.userId).toBe(userId);
        expect(out.hits[0]?.overlap).toBe(2);
        expect([...(out.hits[0]?.matchedSkills ?? [])].sort()).toEqual(['Java', 'Python']);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('resolves label vocabulary variants to the catalog skill (reactjs → React)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const userId = crypto.randomUUID();

        // Catalog skill is "React"; the task label is "reactjs" — different
        // vocabulary. An alias bridges them; "Node.js" resolves by slug alone.
        const reactId = await seedCatalogSkill(pool, t.tenant_id, 'React');
        const nodeId = await seedCatalogSkill(pool, t.tenant_id, 'Node.js');
        await seedSkillAlias(pool, t.tenant_id, reactId, 'reactjs');

        const [p] = await peopleDb()
          .insert(person)
          .values({ tenant_id: t.tenant_id, user_id: userId })
          .returning();
        // This person has React but NOT Node.js.
        await addPersonSkill({ person_id: p!.id, skill_id: reactId, session: t.adminSession });

        const tool = buildSearchUsersBySkillExactSpec();
        const out = await tool.execute({
          session: {
            tenant_id: t.tenant_id,
            user_id: t.adminSession.user_id,
            role_summary: t.adminSession.role_summary,
          },
          input: { labels: ['reactjs', 'nodejs'] },
        });

        // Matched on React (via the reactjs alias); nodejs resolved to a real
        // skill the person lacks, so overlap is 1 — but they DO surface.
        expect(out.hits).toHaveLength(1);
        expect(out.hits[0]?.userId).toBe(userId);
        expect(out.hits[0]?.overlap).toBe(1);
        expect(out.hits[0]?.matchedSkills).toEqual(['React']);
        expect(nodeId).toBeTruthy();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('drops persons with no linked user account', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const skillId = await seedCatalogSkill(pool, t.tenant_id, 'Rust');

        // Person with NO user_id — cannot be an assignment candidate.
        const [p] = await peopleDb().insert(person).values({ tenant_id: t.tenant_id }).returning();
        await addPersonSkill({ person_id: p!.id, skill_id: skillId, session: t.adminSession });

        const out = await buildSearchUsersBySkillExactSpec().execute({
          session: {
            tenant_id: t.tenant_id,
            user_id: t.adminSession.user_id,
            role_summary: t.adminSession.role_summary,
          },
          input: { labels: ['rust'] },
        });
        expect(out.hits).toHaveLength(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
