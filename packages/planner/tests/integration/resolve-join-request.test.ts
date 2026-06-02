import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createGroup,
  createJoinRequest,
  listGroupMembers,
  resolveJoinRequest,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

describe('resolveJoinRequest', () => {
  it('approve → user added to group members', async () => {
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
            name: 'Pub',
            visibility: 'public',
            session: seeded.adminSession,
          });
          const requesterEmail = `rq-${crypto.randomUUID().slice(0, 8)}@t.com`;
          const requester = await import('@seta/identity').then((m) =>
            m.createUser(
              { tenant_id: seeded.tenant_id, email: requesterEmail, name: 'Rq', password: 'pass' },
              { type: 'cli', user_id: null },
            ),
          );
          // assignee_projection is a read-model — subscriber not wired in tests; seed it manually.
          await pool.query(
            `INSERT INTO planner.assignee_projection (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
             VALUES ($1, $2, $3, $4, ARRAY[]::text[], 'available', 'UTC') ON CONFLICT (user_id) DO NOTHING`,
            [requester.user_id, seeded.tenant_id, 'Rq', requesterEmail],
          );
          const requesterSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: requester.user_id,
            roles: ['planner.viewer'],
          });
          await createJoinRequest({ group_id: group.id, session: requesterSession });

          await resolveJoinRequest({
            group_id: group.id,
            user_id: requester.user_id,
            action: 'approved',
            session: seeded.adminSession as never,
          });

          const { members } = await listGroupMembers({
            group_id: group.id,
            session: seeded.adminSession,
          });
          const memberIds = members.map((m) => m.user_id);
          expect(memberIds).toContain(requester.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('reject → status is rejected, user is NOT added as member', async () => {
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
            name: 'Pub2',
            visibility: 'public',
            session: seeded.adminSession,
          });
          const requester = await import('@seta/identity').then((m) =>
            m.createUser(
              {
                tenant_id: seeded.tenant_id,
                email: `rq2-${crypto.randomUUID().slice(0, 8)}@t.com`,
                name: 'Rq2',
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

          const result = await resolveJoinRequest({
            group_id: group.id,
            user_id: requester.user_id,
            action: 'rejected',
            session: seeded.adminSession as never,
          });

          expect(result.status).toBe('rejected');
          const { members } = await listGroupMembers({
            group_id: group.id,
            session: seeded.adminSession,
          });
          expect(members.map((m) => m.user_id)).not.toContain(requester.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
