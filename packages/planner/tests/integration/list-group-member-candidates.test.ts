import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, listGroupMemberCandidates } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const DB = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('listGroupMemberCandidates', () => {
  it('excludes existing members, returns only non-members', async () => {
    await withTestDb(DB(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [
            { name: 'Alice', email: 'alice@example.test' },
            { name: 'Bob', email: 'bob@example.test' },
          ],
        });
        const [alice, bob] = seeded.users;
        if (!alice || !bob) throw new Error('seed failed');

        // createGroup auto-adds creator (admin) as member
        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Eng',
          session: seeded.adminSession,
        });

        const candidates = await listGroupMemberCandidates({
          group_id: group.id,
          session: seeded.adminSession,
        });

        const ids = candidates.map((c) => c.user_id);
        // admin is already a member (auto-added as owner) — must not appear
        expect(ids).not.toContain(seeded.admin.user_id);
        // alice and bob are non-members — must appear
        expect(ids).toContain(alice.user_id);
        expect(ids).toContain(bob.user_id);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('filters by search term against display_name (case-insensitive)', async () => {
    await withTestDb(DB(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [
            { name: 'Alice Smith', email: 'alice@example.test' },
            { name: 'Bob Jones', email: 'bob@example.test' },
          ],
        });
        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Eng',
          session: seeded.adminSession,
        });

        const candidates = await listGroupMemberCandidates({
          group_id: group.id,
          search: 'alice',
          session: seeded.adminSession,
        });

        expect(candidates).toHaveLength(1);
        expect(candidates[0]!.display_name).toBe('Alice Smith');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('filters by search term against email', async () => {
    await withTestDb(DB(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [
            { name: 'Alice Smith', email: 'alice@example.test' },
            { name: 'Bob Jones', email: 'bob@example.test' },
          ],
        });
        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Eng',
          session: seeded.adminSession,
        });

        const candidates = await listGroupMemberCandidates({
          group_id: group.id,
          search: 'bob@',
          session: seeded.adminSession,
        });

        expect(candidates).toHaveLength(1);
        expect(candidates[0]!.email).toBe('bob@example.test');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('respects the limit param', async () => {
    await withTestDb(DB(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [
            { name: 'User1', email: 'u1@example.test' },
            { name: 'User2', email: 'u2@example.test' },
            { name: 'User3', email: 'u3@example.test' },
          ],
        });
        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Eng',
          session: seeded.adminSession,
        });

        const candidates = await listGroupMemberCandidates({
          group_id: group.id,
          limit: 2,
          session: seeded.adminSession,
        });

        expect(candidates).toHaveLength(2);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws FORBIDDEN for a session lacking planner.group.member.read', async () => {
    await withTestDb(DB(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Eng',
          session: seeded.adminSession,
        });
        const viewer = buildSession({
          tenant_id: seeded.tenant_id,
          user_id: crypto.randomUUID(),
          roles: [],
        });
        await expect(
          listGroupMemberCandidates({ group_id: group.id, session: viewer }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
