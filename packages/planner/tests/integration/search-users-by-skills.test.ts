import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { addGroupMember, createGroup, searchUsersBySkills } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

describe('searchUsersBySkills', () => {
  it('returns members ranked by skill overlap', async () => {
    // Case-insensitive matching test
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
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

          await pool.query(
            `UPDATE planner.assignee_projection SET skills = $1 WHERE user_id = $2`,
            [['TypeScript', 'React'], dana.user_id],
          );
          await pool.query(
            `UPDATE planner.assignee_projection SET skills = $1 WHERE user_id = $2`,
            [['typescript', 'react'], eli.user_id],
          );

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Frontend',
            session,
          });

          await addGroupMember({ group_id: group.id, user_id: dana.user_id, session });
          await addGroupMember({ group_id: group.id, user_id: eli.user_id, session });

          // Search with lowercase skills
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
          await closePools();
        }
      },
    );
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
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

          // Update assignee_projection with skills
          await pool.query(
            `UPDATE planner.assignee_projection SET skills = $1 WHERE user_id = $2`,
            [['TypeScript', 'React', 'PostgreSQL'], alice.user_id],
          );
          await pool.query(
            `UPDATE planner.assignee_projection SET skills = $1 WHERE user_id = $2`,
            [['TypeScript', 'Node.js'], bob.user_id],
          );
          await pool.query(
            `UPDATE planner.assignee_projection SET skills = $1 WHERE user_id = $2`,
            [['Python', 'Django'], charlie.user_id],
          );

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Engineering',
            session,
          });

          // Add all three users to the group
          await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });
          await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
          await addGroupMember({ group_id: group.id, user_id: charlie.user_id, session });

          // Search for TypeScript and React skills
          const candidates = await searchUsersBySkills({
            group_id: group.id,
            skills: ['TypeScript', 'React'],
            limit: 10,
            session,
          });

          // Alice has both TypeScript and React (score: 2)
          // Bob has only TypeScript (score: 1)
          // Charlie has neither (not included)
          expect(candidates).toHaveLength(2);
          expect(candidates[0]?.userId).toBe(alice.user_id);
          expect(candidates[0]?.displayName).toBe('Alice');
          expect(candidates[0]?.matchedSkills).toEqual(['TypeScript', 'React']);
          expect(candidates[0]?.score).toBe(2);

          expect(candidates[1]?.userId).toBe(bob.user_id);
          expect(candidates[1]?.displayName).toBe('Bob');
          expect(candidates[1]?.matchedSkills).toEqual(['TypeScript']);
          expect(candidates[1]?.score).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('respects limit parameter', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
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

          // All have TypeScript
          await pool.query(
            `UPDATE planner.assignee_projection SET skills = $1 WHERE user_id = $2`,
            [['TypeScript', 'React'], alice.user_id],
          );
          await pool.query(
            `UPDATE planner.assignee_projection SET skills = $1 WHERE user_id = $2`,
            [['TypeScript'], bob.user_id],
          );
          await pool.query(
            `UPDATE planner.assignee_projection SET skills = $1 WHERE user_id = $2`,
            [['TypeScript'], charlie.user_id],
          );

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
          await closePools();
        }
      },
    );
  });

  it('returns empty array when no members match', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Alice', email: 'alice@example.test' }],
          });
          const session = seeded.adminSession;
          const [alice] = seeded.users;
          if (!alice) throw new Error('Seed did not create Alice');

          await pool.query(
            `UPDATE planner.assignee_projection SET skills = $1 WHERE user_id = $2`,
            [['Python'], alice.user_id],
          );

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
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND when group does not exist', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
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
          await closePools();
        }
      },
    );
  });

  it('throws FORBIDDEN when session lacks planner.group.member.read', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
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
          await closePools();
        }
      },
    );
  });
});
