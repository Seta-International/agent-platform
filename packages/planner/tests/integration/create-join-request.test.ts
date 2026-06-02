import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { addGroupMember, createGroup, createJoinRequest } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

describe('createJoinRequest', () => {
  it('creates a pending request for a public group', async () => {
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
            name: 'Public G',
            visibility: 'public',
            session: seeded.adminSession,
          });

          const requester = await import('@seta/identity').then((m) =>
            m.createUser(
              {
                tenant_id: seeded.tenant_id,
                email: `req-${crypto.randomUUID().slice(0, 8)}@t.com`,
                name: 'Req',
                password: 'pass',
              },
              { type: 'cli', user_id: null },
            ),
          );
          const requesterSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: requester.user_id,
            roles: ['planner.viewer'],
          });

          const req = await createJoinRequest({ group_id: group.id, session: requesterSession });
          expect(req.status).toBe('pending');
          expect(req.group_id).toBe(group.id);
          expect(req.user_id).toBe(requester.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws JOIN_REQUEST_PRIVATE_GROUP for a private group', async () => {
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
            name: 'Private G',
            visibility: 'private',
            session: seeded.adminSession,
          });

          const requester = await import('@seta/identity').then((m) =>
            m.createUser(
              {
                tenant_id: seeded.tenant_id,
                email: `req2-${crypto.randomUUID().slice(0, 8)}@t.com`,
                name: 'R2',
                password: 'pass',
              },
              { type: 'cli', user_id: null },
            ),
          );
          const requesterSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: requester.user_id,
            roles: ['planner.viewer'],
          });

          await expect(
            createJoinRequest({ group_id: group.id, session: requesterSession }),
          ).rejects.toMatchObject({ code: 'JOIN_REQUEST_PRIVATE_GROUP' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws ALREADY_MEMBER if requester is already a member', async () => {
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
            users: [{ name: 'Member', email: `m-${crypto.randomUUID().slice(0, 8)}@t.com` }],
          });
          const member = seeded.users[0]!;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Public G2',
            visibility: 'public',
            session: seeded.adminSession,
          });
          await addGroupMember({
            group_id: group.id,
            user_id: member.user_id,
            session: seeded.adminSession as never,
          });

          const memberSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: member.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [group.id],
          });
          await expect(
            createJoinRequest({ group_id: group.id, session: memberSession }),
          ).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws JOIN_REQUEST_DUPLICATE if a pending request already exists', async () => {
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
            name: 'Public G3',
            visibility: 'public',
            session: seeded.adminSession,
          });
          const requester = await import('@seta/identity').then((m) =>
            m.createUser(
              {
                tenant_id: seeded.tenant_id,
                email: `req3-${crypto.randomUUID().slice(0, 8)}@t.com`,
                name: 'R3',
                password: 'pass',
              },
              { type: 'cli', user_id: null },
            ),
          );
          const requesterSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: requester.user_id,
            roles: ['planner.viewer'],
          });
          await createJoinRequest({ group_id: group.id, session: requesterSession });
          await expect(
            createJoinRequest({ group_id: group.id, session: requesterSession }),
          ).rejects.toMatchObject({ code: 'JOIN_REQUEST_DUPLICATE' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
