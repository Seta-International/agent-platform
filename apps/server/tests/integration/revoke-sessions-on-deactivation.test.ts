import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { revokeSessionsOnDeactivationSubscriber } from '../../src/subscribers/revoke-sessions-on-deactivation.ts';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };

async function seedTenantWithUser(pool: import('pg').Pool): Promise<{
  tenantId: string;
  userId: string;
}> {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', $2)`, [
    tenantId,
    `t-${tenantId.slice(0, 8)}`,
  ]);
  const { user_id } = await createUser(
    {
      tenant_id: tenantId,
      email: 'subject@t.local',
      name: 'Subject',
      password: 'subject-password-1234',
    },
    CLI_ACTOR,
  );
  return { tenantId, userId: user_id };
}

async function insertSession(pool: import('pg').Pool, userId: string): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO identity.session (id, user_id, token, expires_at)
     VALUES ($1, $2, $3, now() + interval '1 hour')`,
    [id, userId, crypto.randomUUID()],
  );
  return id;
}

describe('revokeSessionsOnDeactivationSubscriber', () => {
  it('deletes all live sessions for the deactivated user', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, userId } = await seedTenantWithUser(pool);
          const s1 = await insertSession(pool, userId);
          const s2 = await insertSession(pool, userId);

          const sub = revokeSessionsOnDeactivationSubscriber();
          await sub.handler(
            {
              id: crypto.randomUUID(),
              tenantId,
              eventType: 'identity.user.deactivated',
              eventVersion: 1,
              payload: {
                actor: { type: 'user', user_id: userId },
                user_id: userId,
                tenant_id: tenantId,
                deactivated_at: new Date().toISOString(),
              },
            } as never,
            {} as never,
          );

          const { rows } = await pool.query<{ id: string }>(
            `SELECT id FROM identity.session WHERE user_id = $1`,
            [userId],
          );
          expect(rows).toHaveLength(0);

          const { rows: events } = await pool.query<{ session_id: string }>(
            `SELECT (payload->>'session_id') AS session_id FROM core.events
             WHERE tenant_id = $1 AND event_type = 'identity.session.revoked'
             ORDER BY id ASC`,
            [tenantId],
          );
          expect(events.map((e) => e.session_id).sort()).toEqual([s1, s2].sort());
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is a no-op when the user has no live sessions', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, userId } = await seedTenantWithUser(pool);

          const sub = revokeSessionsOnDeactivationSubscriber();
          await expect(
            sub.handler(
              {
                id: crypto.randomUUID(),
                tenantId,
                eventType: 'identity.user.deactivated',
                eventVersion: 1,
                payload: {
                  actor: { type: 'user', user_id: userId },
                  user_id: userId,
                  tenant_id: tenantId,
                  deactivated_at: new Date().toISOString(),
                },
              } as never,
              {} as never,
            ),
          ).resolves.toBeUndefined();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
