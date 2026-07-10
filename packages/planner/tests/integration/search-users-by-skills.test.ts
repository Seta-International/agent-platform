import { resetCoreDb } from '@seta/core/testing';
import { resetPeopleDb } from '@seta/people/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { addGroupMember, createGroup, searchUsersBySkills } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

// searchUsersBySkills reads live skills from People (getPersonSkills joins
// person_skill → user_projection on the user↔person link). Seed a People person + skills.
async function seedPeopleSkills(
  pool: Pool,
  tenantId: string,
  userId: string,
  skillNames: string[],
): Promise<void> {
  const personId = crypto.randomUUID();
  await pool.query(`INSERT INTO people.person (id, tenant_id) VALUES ($1, $2)`, [
    personId,
    tenantId,
  ]);
  await pool.query(
    `INSERT INTO people.user_projection (user_id, tenant_id, person_id) VALUES ($1, $2, $3)`,
    [userId, tenantId, personId],
  );
  for (const name of skillNames) {
    await pool.query(
      `INSERT INTO people.person_skill (id, tenant_id, person_id, skill_id, skill_name)
       VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), $3)`,
      [tenantId, personId, name],
    );
  }
}

const dbCtx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('searchUsersBySkills', () => {
  it('returns members ranked by skill overlap (case-insensitive)', async () => {
    await withTestDb(dbCtx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [
            { name: 'Dana', email: 'dana@example.test' },
            { name: 'Eli', email: 'eli@example.test' },
          ],
        });
        const session = seeded.adminSession;
        const [dana, eli] = seeded.users;
        if (!dana || !eli) throw new Error('Seed did not create all users');

        await seedPeopleSkills(pool, seeded.tenant_id, dana.user_id, ['TypeScript', 'React']);
        await seedPeopleSkills(pool, seeded.tenant_id, eli.user_id, ['typescript', 'react']);

        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Frontend', session });
        await addGroupMember({ group_id: group.id, user_id: dana.user_id, session });
        await addGroupMember({ group_id: group.id, user_id: eli.user_id, session });

        const candidates = await searchUsersBySkills({
          group_id: group.id,
          skills: ['typescript', 'react'],
          limit: 10,
          session,
        });

        expect(candidates).toHaveLength(2);
        expect(candidates[0]?.matchedSkills.map((s) => s.toLowerCase()).sort()).toEqual([
          'react',
          'typescript',
        ]);
        expect(candidates[1]?.matchedSkills.map((s) => s.toLowerCase()).sort()).toEqual([
          'react',
          'typescript',
        ]);
      } finally {
        resetCoreDb();
        resetPeopleDb();
        await closePools();
      }
    });

    await withTestDb(dbCtx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [
            { name: 'Alice', email: 'alice@example.test' },
            { name: 'Bob', email: 'bob@example.test' },
            { name: 'Charlie', email: 'charlie@example.test' },
          ],
        });
        const session = seeded.adminSession;
        const [alice, bob, charlie] = seeded.users;
        if (!alice || !bob || !charlie) throw new Error('Seed did not create all users');

        await seedPeopleSkills(pool, seeded.tenant_id, alice.user_id, [
          'TypeScript',
          'React',
          'PostgreSQL',
        ]);
        await seedPeopleSkills(pool, seeded.tenant_id, bob.user_id, ['TypeScript', 'Node.js']);
        await seedPeopleSkills(pool, seeded.tenant_id, charlie.user_id, ['Python', 'Django']);

        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Engineering',
          session,
        });
        await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });
        await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
        await addGroupMember({ group_id: group.id, user_id: charlie.user_id, session });

        const candidates = await searchUsersBySkills({
          group_id: group.id,
          skills: ['TypeScript', 'React'],
          limit: 10,
          session,
        });

        // Alice matches both (score 2), Bob only TypeScript (score 1), Charlie none.
        // getPersonSkills returns names ordered by skill_name, so matchedSkills are sorted.
        expect(candidates).toHaveLength(2);
        expect(candidates[0]?.userId).toBe(alice.user_id);
        expect(candidates[0]?.displayName).toBe('Alice');
        expect(candidates[0]?.matchedSkills).toEqual(['React', 'TypeScript']);
        expect(candidates[0]?.score).toBe(2);

        expect(candidates[1]?.userId).toBe(bob.user_id);
        expect(candidates[1]?.displayName).toBe('Bob');
        expect(candidates[1]?.matchedSkills).toEqual(['TypeScript']);
        expect(candidates[1]?.score).toBe(1);
      } finally {
        resetCoreDb();
        resetPeopleDb();
        await closePools();
      }
    });
  });

  it('respects limit parameter', async () => {
    await withTestDb(dbCtx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [
            { name: 'Alice', email: 'alice@example.test' },
            { name: 'Bob', email: 'bob@example.test' },
            { name: 'Charlie', email: 'charlie@example.test' },
          ],
        });
        const session = seeded.adminSession;
        const [alice, bob, charlie] = seeded.users;
        if (!alice || !bob || !charlie) throw new Error('Seed did not create all users');

        await seedPeopleSkills(pool, seeded.tenant_id, alice.user_id, ['TypeScript', 'React']);
        await seedPeopleSkills(pool, seeded.tenant_id, bob.user_id, ['TypeScript']);
        await seedPeopleSkills(pool, seeded.tenant_id, charlie.user_id, ['TypeScript']);

        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Engineering',
          session,
        });
        await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });
        await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
        await addGroupMember({ group_id: group.id, user_id: charlie.user_id, session });

        const candidates = await searchUsersBySkills({
          group_id: group.id,
          skills: ['TypeScript'],
          limit: 2,
          session,
        });

        expect(candidates).toHaveLength(2);
      } finally {
        resetCoreDb();
        resetPeopleDb();
        await closePools();
      }
    });
  });

  it('returns empty array when no members match', async () => {
    await withTestDb(dbCtx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [{ name: 'Alice', email: 'alice@example.test' }],
        });
        const session = seeded.adminSession;
        const [alice] = seeded.users;
        if (!alice) throw new Error('Seed did not create Alice');

        await seedPeopleSkills(pool, seeded.tenant_id, alice.user_id, ['Python']);

        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Engineering',
          session,
        });
        await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });

        const candidates = await searchUsersBySkills({
          group_id: group.id,
          skills: ['TypeScript'],
          limit: 10,
          session,
        });

        expect(candidates).toHaveLength(0);
      } finally {
        resetCoreDb();
        resetPeopleDb();
        await closePools();
      }
    });
  });

  it('throws NOT_FOUND when group does not exist', async () => {
    await withTestDb(dbCtx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        await expect(
          searchUsersBySkills({
            group_id: crypto.randomUUID(),
            skills: ['TypeScript'],
            limit: 10,
            session: seeded.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        resetCoreDb();
        resetPeopleDb();
        await closePools();
      }
    });
  });

  it('throws FORBIDDEN when session lacks planner.group.member.read', async () => {
    await withTestDb(dbCtx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Engineering',
          session: seeded.adminSession,
        });

        const viewerSession = buildSession({
          tenant_id: seeded.tenant_id,
          user_id: crypto.randomUUID(),
          roles: [],
        });

        await expect(
          searchUsersBySkills({
            group_id: group.id,
            skills: ['TypeScript'],
            limit: 10,
            session: viewerSession,
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetCoreDb();
        resetPeopleDb();
        await closePools();
      }
    });
  });
});
